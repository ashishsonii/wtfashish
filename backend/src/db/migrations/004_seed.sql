-- 004_seed.sql — Production-grade seed for WTF LivePulse
-- Targets: 10 gyms, 5000 members, ~270K checkins, 5000-6000 payments
-- Uses batch INSERT...SELECT with generate_series() for performance
-- All interval expressions use multiplication (INTERVAL '1 min' * N) to avoid scientific notation bugs

DO $$
DECLARE
  v_count INTEGER;
  v_now TIMESTAMPTZ := NOW();
  v_today DATE := CURRENT_DATE;
  v_bandra_id UUID;
  v_velachery_id UUID;
  v_saltlake_id UUID;
BEGIN
  -- Idempotent guard
  SELECT COUNT(*) INTO v_count FROM gyms;
  IF v_count > 0 THEN
    RAISE NOTICE 'Seed data already exists (% gyms). Skipping.', v_count;
    RETURN;
  END IF;

  RAISE NOTICE '=== WTF LivePulse Seed Starting === %', v_now;

  ----------------------------------------------------------------
  -- PHASE 1: GYMS (10 records)
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 1: Seeding 10 gyms...';

  INSERT INTO gyms (name, city, address, capacity, status, opens_at, closes_at) VALUES
    ('WTF Gyms — Lajpat Nagar',   'New Delhi', 'Block E, Lajpat Nagar II, New Delhi',  220, 'active', '05:30', '22:30'),
    ('WTF Gyms — Connaught Place', 'New Delhi', 'N Block, Connaught Place, New Delhi',  180, 'active', '06:00', '22:00'),
    ('WTF Gyms — Bandra West',    'Mumbai',    'Hill Road, Bandra West, Mumbai',        300, 'active', '05:00', '23:00'),
    ('WTF Gyms — Powai',           'Mumbai',    'Hiranandani Gardens, Powai, Mumbai',   250, 'active', '05:30', '22:30'),
    ('WTF Gyms — Indiranagar',     'Bengaluru', '100 Feet Road, Indiranagar, Bengaluru',200, 'active', '05:30', '22:00'),
    ('WTF Gyms — Koramangala',     'Bengaluru', '80 Feet Road, Koramangala, Bengaluru', 180, 'active', '06:00', '22:00'),
    ('WTF Gyms — Banjara Hills',   'Hyderabad', 'Road No. 12, Banjara Hills, Hyderabad',160,'active', '06:00', '22:00'),
    ('WTF Gyms — Sector 18 Noida', 'Noida',     'Sector 18, Noida, UP',                140, 'active', '06:00', '21:30'),
    ('WTF Gyms — Salt Lake',       'Kolkata',   'Sector V, Salt Lake City, Kolkata',    120, 'active', '06:00', '21:00'),
    ('WTF Gyms — Velachery',       'Chennai',   'Velachery Main Road, Chennai',         110, 'active', '06:00', '21:00');

  SELECT id INTO v_bandra_id   FROM gyms WHERE name ILIKE '%Bandra%';
  SELECT id INTO v_velachery_id FROM gyms WHERE name ILIKE '%Velachery%';
  SELECT id INTO v_saltlake_id  FROM gyms WHERE name ILIKE '%Salt Lake%';
  RAISE NOTICE '  Gyms done. Bandra=% Velachery=% SaltLake=%', v_bandra_id, v_velachery_id, v_saltlake_id;

  ----------------------------------------------------------------
  -- PHASE 2: MEMBERS (5000)
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 2: Seeding 5000 members...';

  CREATE TEMP TABLE _fnames(idx SERIAL, n TEXT);
  INSERT INTO _fnames(n) VALUES
    ('Aarav'),('Vivaan'),('Aditya'),('Vihaan'),('Arjun'),('Sai'),('Reyansh'),('Ayaan'),('Krishna'),('Ishaan'),
    ('Shaurya'),('Atharv'),('Advik'),('Pranav'),('Advaith'),('Dhruv'),('Kabir'),('Ritvik'),('Aarush'),('Kayaan'),
    ('Darsh'),('Virat'),('Rudra'),('Arnav'),('Krish'),('Rohan'),('Devansh'),('Rishi'),('Shivansh'),('Rian'),
    ('Anaya'),('Aadhya'),('Myra'),('Aanya'),('Avni'),('Ira'),('Diya'),('Saanvi'),('Pari'),('Prisha'),
    ('Anvi'),('Anika'),('Navya'),('Kiara'),('Riya'),('Sara'),('Aarohi'),('Zara'),('Tara'),('Mira'),
    ('Rahul'),('Amit'),('Deepak'),('Suresh'),('Rajesh'),('Priya'),('Neha'),('Pooja'),('Sneha'),('Kavita'),
    ('Vikram'),('Sanjay'),('Manish'),('Gaurav'),('Rakesh'),('Anjali'),('Swati'),('Divya'),('Nisha'),('Meera'),
    ('Karan'),('Nikhil'),('Sahil'),('Akshay'),('Mohit'),('Pallavi'),('Shruti'),('Megha'),('Ritu'),('Jyoti'),
    ('Varun'),('Tarun'),('Harsh'),('Pankaj'),('Ankit'),('Preeti'),('Komal'),('Sonia'),('Rekha'),('Sunita'),
    ('Dev'),('Ved'),('Yash'),('Raj'),('Om'),('Isha'),('Sia'),('Nia'),('Pia'),('Mia');

  CREATE TEMP TABLE _lnames(idx SERIAL, n TEXT);
  INSERT INTO _lnames(n) VALUES
    ('Sharma'),('Verma'),('Gupta'),('Patel'),('Singh'),('Kumar'),('Joshi'),('Mehta'),('Shah'),('Reddy'),
    ('Nair'),('Iyer'),('Rao'),('Das'),('Bose'),('Chatterjee'),('Mukherjee'),('Banerjee'),('Ghosh'),('Roy'),
    ('Agarwal'),('Jain'),('Mishra'),('Pandey'),('Tiwari'),('Dubey'),('Shukla'),('Chauhan'),('Yadav'),('Thakur'),
    ('Bhatt'),('Chopra'),('Malhotra'),('Kapoor'),('Khanna'),('Arora'),('Bhatia'),('Sood'),('Gill'),('Kaur'),
    ('Desai'),('Modi'),('Trivedi'),('Parikh'),('Kulkarni'),('Deshpande'),('Patil'),('More'),('Jadhav'),('Pawar');

  CREATE TEMP TABLE _gymspec (pat TEXT, cnt INT, m_pct FLOAT, q_pct FLOAT, a_pct FLOAT, act_pct FLOAT);
  INSERT INTO _gymspec VALUES
    ('%Lajpat%',650,0.50,0.30,0.20,0.88), ('%Connaught%',550,0.40,0.40,0.20,0.85),
    ('%Bandra%',750,0.40,0.40,0.20,0.90), ('%Powai%',600,0.40,0.40,0.20,0.87),
    ('%Indiranagar%',550,0.40,0.40,0.20,0.89), ('%Koramangala%',500,0.40,0.40,0.20,0.86),
    ('%Banjara%',450,0.50,0.30,0.20,0.84), ('%Noida%',400,0.60,0.25,0.15,0.82),
    ('%Salt Lake%',300,0.60,0.30,0.10,0.80), ('%Velachery%',250,0.60,0.30,0.10,0.78);

  CREATE TEMP TABLE _member_staging (seq INT, gym_id UUID, m_pct FLOAT, q_pct FLOAT, act_pct FLOAT);
  INSERT INTO _member_staging (seq, gym_id, m_pct, q_pct, act_pct)
  SELECT s.n, g.id, sp.m_pct, sp.q_pct, sp.act_pct
  FROM _gymspec sp JOIN gyms g ON g.name ILIKE sp.pat
  CROSS JOIN generate_series(1, sp.cnt) AS s(n);

  -- Batch insert all 5000 members
  INSERT INTO members (gym_id, name, email, phone, plan_type, member_type, status, joined_at, plan_expires_at, last_checkin_at)
  SELECT
    ms.gym_id,
    f.n || ' ' || l.n,
    lower(f.n) || '.' || lower(l.n) || ms.seq || '@gmail.com',
    (7000000000 + floor(random() * 2999999999))::BIGINT::TEXT,
    CASE WHEN random() < ms.m_pct THEN 'monthly' WHEN random() < ms.m_pct + ms.q_pct THEN 'quarterly' ELSE 'annual' END,
    CASE WHEN random() < 0.80 THEN 'new' ELSE 'renewal' END,
    CASE WHEN random() < ms.act_pct THEN 'active' WHEN random() < ms.act_pct + 0.08 THEN 'inactive' ELSE 'frozen' END,
    -- joined_at
    CASE WHEN random() < ms.act_pct
      THEN v_now - INTERVAL '1 day' * floor(random() * 90)
      ELSE v_now - INTERVAL '1 day' * floor(91 + random() * 89)
    END,
    v_now, -- placeholder for plan_expires_at
    v_now - INTERVAL '1 day' * floor(random() * 30)  -- placeholder for last_checkin_at
  FROM _member_staging ms
  JOIN _fnames f ON f.idx = 1 + (ms.seq % 100)
  JOIN _lnames l ON l.idx = 1 + ((ms.seq * 7) % 50);

  -- Fix plan_expires_at
  UPDATE members SET plan_expires_at = joined_at +
    CASE plan_type WHEN 'monthly' THEN INTERVAL '30 days' WHEN 'quarterly' THEN INTERVAL '90 days' ELSE INTERVAL '365 days' END;

  SELECT COUNT(*) INTO v_count FROM members;
  RAISE NOTICE '  Members seeded: %', v_count;

  ----------------------------------------------------------------
  -- PHASE 3: CHECKINS (~270K across 90 days)
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 3: Seeding ~270K checkins (batch)...';

  CREATE TEMP TABLE _hmult (h INT, m FLOAT);
  INSERT INTO _hmult VALUES
    (0,0),(1,0),(2,0),(3,0),(4,0),(5,0.30),
    (6,0.60),(7,1.00),(8,1.00),(9,1.00),
    (10,0.40),(11,0.40),(12,0.30),(13,0.30),
    (14,0.20),(15,0.20),(16,0.20),
    (17,0.90),(18,0.90),(19,0.90),(20,0.90),
    (21,0.35),(22,0.15),(23,0);

  CREATE TEMP TABLE _dmult (d INT, m FLOAT);
  INSERT INTO _dmult VALUES (0,0.45),(1,1.00),(2,0.95),(3,0.90),(4,0.95),(5,0.85),(6,0.70);

  CREATE TEMP TABLE _gym_base (gym_id UUID, base INT);
  INSERT INTO _gym_base
  SELECT g.id,
    CASE
      WHEN g.name ILIKE '%Bandra%' THEN 55
      WHEN g.name ILIKE '%Powai%' THEN 46
      WHEN g.name ILIKE '%Lajpat%' THEN 42
      WHEN g.name ILIKE '%Connaught%' THEN 37
      WHEN g.name ILIKE '%Indiranagar%' THEN 39
      WHEN g.name ILIKE '%Koramangala%' THEN 35
      WHEN g.name ILIKE '%Banjara%' THEN 30
      WHEN g.name ILIKE '%Noida%' THEN 28
      WHEN g.name ILIKE '%Salt Lake%' THEN 23
      WHEN g.name ILIKE '%Velachery%' THEN 21
    END
  FROM gyms g;

  -- Index member pool per gym
  CREATE TEMP TABLE _mpool (gym_id UUID, mid UUID, rn INT);
  INSERT INTO _mpool
  SELECT gym_id, id, ROW_NUMBER() OVER (PARTITION BY gym_id ORDER BY random())
  FROM members WHERE status = 'active';

  -- MASSIVE batch insert: all historical checkins in ONE query
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT
    mp.mid,
    gb.gym_id,
    (v_today - dd.d) + INTERVAL '1 hour' * hm.h + INTERVAL '1 minute' * floor(random() * 55),
    (v_today - dd.d) + INTERVAL '1 hour' * hm.h + INTERVAL '1 minute' * floor(random() * 55)
      + INTERVAL '1 minute' * floor(45 + random() * 45)
  FROM _gym_base gb
  CROSS JOIN generate_series(1, 89) AS dd(d)
  CROSS JOIN _hmult hm
  CROSS JOIN _dmult dm
  JOIN _mpool mp ON mp.gym_id = gb.gym_id
  WHERE hm.m > 0
    AND dm.d = EXTRACT(DOW FROM (v_today - dd.d))::INT
    AND mp.rn <= GREATEST(1, (gb.base * hm.m * dm.m)::INT);

  SELECT COUNT(*) INTO v_count FROM checkins;
  RAISE NOTICE '  Historical checkins: %', v_count;

  ----------------------------------------------------------------
  -- PHASE 4: ANOMALY A — Velachery zero open checkins
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 4: Anomaly A — Velachery...';

  UPDATE checkins SET checked_out = checked_in + INTERVAL '60 minutes'
    WHERE gym_id = v_velachery_id AND checked_out IS NULL;
  DELETE FROM checkins
    WHERE gym_id = v_velachery_id AND checked_in > v_now - INTERVAL '2 hours 10 minutes';

  ----------------------------------------------------------------
  -- PHASE 5: ANOMALY B — Bandra capacity breach (280 open)
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 5: Anomaly B — Bandra 280 open...';

  UPDATE checkins SET checked_out = checked_in + INTERVAL '60 minutes'
    WHERE gym_id = v_bandra_id AND checked_out IS NULL;

  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, v_bandra_id, v_now - INTERVAL '1 minute' * floor(random() * 85), NULL
  FROM members m WHERE m.gym_id = v_bandra_id AND m.status = 'active'
  ORDER BY random() LIMIT 280;

  ----------------------------------------------------------------
  -- PHASE 6: Open checkins for normal gyms
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 6: Open checkins for normal gyms...';

  -- Close all non-Bandra open checkins
  UPDATE checkins SET checked_out = checked_in + INTERVAL '60 minutes'
    WHERE gym_id != v_bandra_id AND checked_out IS NULL;

  -- Powai: 25-35
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id, v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Powai%') AND m.status='active'
  ORDER BY random() LIMIT 14;

  -- Lajpat: 15-25
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id, v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Lajpat%') AND m.status='active'
  ORDER BY random() LIMIT 18;

  -- Connaught: 15-25
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id, v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Connaught%') AND m.status='active'
  ORDER BY random() LIMIT 18;

  -- Indiranagar: 15-25
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id, v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Indiranagar%') AND m.status='active'
  ORDER BY random() LIMIT 18;

  -- Koramangala: 15-25
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id, v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Koramangala%') AND m.status='active'
  ORDER BY random() LIMIT 16;

  -- Banjara: 15-25
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id, v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Banjara%') AND m.status='active'
  ORDER BY random() LIMIT 16;

  -- Noida: 8-15
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id, v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Noida%') AND m.status='active'
  ORDER BY random() LIMIT 10;

  -- Salt Lake: 8-15
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id, v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Salt Lake%') AND m.status='active'
  ORDER BY random() LIMIT 10;

  -- Velachery: 0 (already handled)

  ----------------------------------------------------------------
  -- PHASE 7: PAYMENTS
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 7: Payments...';

  INSERT INTO payments (member_id, gym_id, amount, plan_type, payment_type, paid_at)
  SELECT m.id, m.gym_id,
    CASE m.plan_type WHEN 'monthly' THEN 1499.00 WHEN 'quarterly' THEN 3999.00 ELSE 11999.00 END,
    m.plan_type, 'new',
    m.joined_at + INTERVAL '1 minute' * floor(random() * 5)
  FROM members m;

  INSERT INTO payments (member_id, gym_id, amount, plan_type, payment_type, paid_at)
  SELECT m.id, m.gym_id,
    CASE m.plan_type WHEN 'monthly' THEN 1499.00 WHEN 'quarterly' THEN 3999.00 ELSE 11999.00 END,
    m.plan_type, 'renewal',
    m.joined_at + CASE m.plan_type WHEN 'monthly' THEN INTERVAL '30 days' WHEN 'quarterly' THEN INTERVAL '90 days' ELSE INTERVAL '365 days' END
  FROM members m
  WHERE m.member_type = 'renewal'
    AND m.joined_at + CASE m.plan_type WHEN 'monthly' THEN INTERVAL '30 days' WHEN 'quarterly' THEN INTERVAL '90 days' ELSE INTERVAL '365 days' END <= v_now;

  ----------------------------------------------------------------
  -- PHASE 8: ANOMALY C — Salt Lake revenue drop
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 8: Anomaly C — Salt Lake revenue...';

  DELETE FROM payments WHERE gym_id = v_saltlake_id AND paid_at::DATE = v_today;

  INSERT INTO payments (member_id, gym_id, amount, plan_type, payment_type, paid_at)
  SELECT m.id, m.gym_id, 1499.00, 'monthly', 'new', v_today + INTERVAL '9 hours'
  FROM members m WHERE m.gym_id = v_saltlake_id AND m.status='active' LIMIT 1;

  INSERT INTO payments (member_id, gym_id, amount, plan_type, payment_type, paid_at)
  SELECT m.id, m.gym_id, 1499.00, 'monthly', 'new',
    (v_today - INTERVAL '7 days') + INTERVAL '1 hour' * (8 + (ROW_NUMBER() OVER (ORDER BY random())) % 10)
  FROM members m WHERE m.gym_id = v_saltlake_id AND m.status='active' LIMIT 12;

  SELECT COUNT(*) INTO v_count FROM payments;
  RAISE NOTICE '  Payments: %', v_count;

  ----------------------------------------------------------------
  -- PHASE 9: Sync last_checkin_at + enforce churn risk
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 9: Syncing last_checkin_at & churn...';

  UPDATE members m SET last_checkin_at = sub.max_ci
  FROM (SELECT member_id, MAX(checked_in) AS max_ci FROM checkins GROUP BY member_id) sub
  WHERE m.id = sub.member_id;

  -- HIGH risk: 250 members with last_checkin 45-60 days ago
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY random()) AS rn
    FROM members WHERE status='active' AND last_checkin_at > v_now - INTERVAL '45 days'
  )
  UPDATE members SET last_checkin_at = v_now - INTERVAL '1 day' * floor(45 + random() * 15)
  FROM ranked WHERE members.id = ranked.id AND ranked.rn <= 250;

  -- CRITICAL risk: 120 members with last_checkin 60+ days ago
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY random()) AS rn
    FROM members WHERE status='active'
      AND last_checkin_at > v_now - INTERVAL '60 days'
      AND last_checkin_at <= v_now - INTERVAL '45 days'
  )
  UPDATE members SET last_checkin_at = v_now - INTERVAL '1 day' * floor(61 + random() * 25)
  FROM ranked WHERE members.id = ranked.id AND ranked.rn <= 120;

  ----------------------------------------------------------------
  -- PHASE 10: Refresh materialized view
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 10: Refreshing materialized view...';
  REFRESH MATERIALIZED VIEW gym_hourly_stats;

  ----------------------------------------------------------------
  -- VALIDATION
  ----------------------------------------------------------------
  RAISE NOTICE '=== VALIDATION ===';

  SELECT COUNT(*) INTO v_count FROM gyms;
  RAISE NOTICE 'V1  Gyms: % (expect 10)', v_count;

  SELECT COUNT(*) INTO v_count FROM members;
  RAISE NOTICE 'V2  Members: % (expect 5000)', v_count;

  SELECT COUNT(*) INTO v_count FROM members WHERE status='active';
  RAISE NOTICE 'V3  Active: % (expect 4100-4400)', v_count;

  SELECT COUNT(*) INTO v_count FROM checkins;
  RAISE NOTICE 'V4  Checkins: % (expect 250K-300K)', v_count;

  SELECT COUNT(*) INTO v_count FROM checkins WHERE checked_out IS NULL;
  RAISE NOTICE 'V5  Open: % (expect 100-350)', v_count;

  SELECT COUNT(*) INTO v_count FROM payments;
  RAISE NOTICE 'V6  Payments: % (expect 5000-6000)', v_count;

  SELECT COUNT(*) INTO v_count FROM members WHERE last_checkin_at < v_now - INTERVAL '45 days' AND status='active';
  RAISE NOTICE 'V7  Churn 45+: % (expect >=230)', v_count;

  SELECT COUNT(*) INTO v_count FROM checkins WHERE gym_id = v_bandra_id AND checked_out IS NULL;
  RAISE NOTICE 'V8  Bandra open: % (expect 275-295)', v_count;

  SELECT COUNT(*) INTO v_count FROM checkins WHERE gym_id = v_velachery_id AND checked_out IS NULL;
  RAISE NOTICE 'V9  Velachery open: % (expect 0)', v_count;

  RAISE NOTICE '=== SEED COMPLETE ===';

  DROP TABLE IF EXISTS _fnames, _lnames, _gymspec, _member_staging, _hmult, _dmult, _gym_base, _mpool;
END $$;
