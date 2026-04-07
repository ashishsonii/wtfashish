-- 004_seed.sql — Production-grade seed for WTF LivePulse
-- Targets: 10 gyms, 5000 members, ~270K checkins, 5000-6000 payments
-- Uses batch INSERT...SELECT with generate_series() for performance
-- Spec-compliant: churn members have real checkin rows matching last_checkin_at

DO $$
DECLARE
  v_count     INTEGER;
  v_now       TIMESTAMPTZ := NOW();
  v_today     DATE        := CURRENT_DATE;
  v_bandra_id   UUID;
  v_velachery_id UUID;
  v_saltlake_id  UUID;
  v_bandra_rev  NUMERIC;
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

  SELECT id INTO v_bandra_id    FROM gyms WHERE name ILIKE '%Bandra%';
  SELECT id INTO v_velachery_id FROM gyms WHERE name ILIKE '%Velachery%';
  SELECT id INTO v_saltlake_id  FROM gyms WHERE name ILIKE '%Salt Lake%';

  RAISE NOTICE '  Gyms done. Bandra=% Velachery=% SaltLake=%',
    v_bandra_id, v_velachery_id, v_saltlake_id;

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
  FROM _gymspec sp
  JOIN gyms g ON g.name ILIKE sp.pat
  CROSS JOIN generate_series(1, sp.cnt) AS s(n);

  -- Batch insert all 5000 members
  INSERT INTO members (gym_id, name, email, phone, plan_type, member_type, status, joined_at, plan_expires_at, last_checkin_at)
  SELECT
    ms.gym_id,
    f.n || ' ' || l.n,
    lower(f.n) || '.' || lower(l.n) || ms.seq || '@gmail.com',
    -- 10-digit Indian mobile starting with 9, 8, or 7
    (ARRAY['9','8','7'])[1 + (ms.seq % 3)] ||
      LPAD(((floor(random() * 900000000)::BIGINT) + 100000000)::TEXT, 9, '0'),
    -- Plan type using deterministic buckets based on seq
    CASE
      WHEN (ms.seq % 100) < (ms.m_pct * 100)::INT              THEN 'monthly'
      WHEN (ms.seq % 100) < ((ms.m_pct + ms.q_pct) * 100)::INT THEN 'quarterly'
      ELSE 'annual'
    END,
    -- member_type: 80% new, 20% renewal (every 5th member is renewal)
    CASE WHEN (ms.seq % 5) = 0 THEN 'renewal' ELSE 'new' END,
    -- Status: deterministic buckets
    CASE
      WHEN (ms.seq % 100) < (ms.act_pct * 100)::INT             THEN 'active'
      WHEN (ms.seq % 100) < (ms.act_pct * 100 + 8)::INT         THEN 'inactive'
      ELSE 'frozen'
    END,
    -- joined_at: active members within last 90 days; inactive/frozen 91-180 days ago
    CASE
      WHEN (ms.seq % 100) < (ms.act_pct * 100)::INT
        THEN v_now - INTERVAL '1 day' * floor(random() * 90)
      ELSE v_now - INTERVAL '1 day' * (91 + floor(random() * 89))
    END,
    v_now,  -- placeholder, fixed below
    NULL    -- placeholder, fixed in Phase 9
  FROM _member_staging ms
  JOIN _fnames f ON f.idx = 1 + (ms.seq % 100)
  JOIN _lnames l ON l.idx = 1 + ((ms.seq * 7) % 50);

  -- Fix plan_expires_at based on actual plan_type
  UPDATE members SET plan_expires_at = joined_at +
    CASE plan_type
      WHEN 'monthly'   THEN INTERVAL '30 days'
      WHEN 'quarterly' THEN INTERVAL '90 days'
      ELSE                  INTERVAL '365 days'
    END;

  SELECT COUNT(*) INTO v_count FROM members;
  RAISE NOTICE '  Members seeded: %', v_count;

  ----------------------------------------------------------------
  -- PHASE 3: CHECKINS (~270K across 90 days)
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 3: Seeding ~270K historical checkins...';

  -- Hourly multipliers per spec §4.1
  CREATE TEMP TABLE _hmult (h INT, m FLOAT);
  INSERT INTO _hmult VALUES
    (0,0),(1,0),(2,0),(3,0),(4,0),(5,0.30),
    (6,0.60),(7,1.00),(8,1.00),(9,1.00),
    (10,0.40),(11,0.40),(12,0.30),(13,0.30),
    (14,0.20),(15,0.20),(16,0.20),
    (17,0.90),(18,0.90),(19,0.90),(20,0.90),
    (21,0.35),(22,0.15),(23,0);

  -- Day-of-week multipliers per spec §4.2 (0=Sun, 1=Mon, ..., 6=Sat)
  CREATE TEMP TABLE _dmult (d INT, m FLOAT);
  INSERT INTO _dmult VALUES
    (0,0.45),(1,1.00),(2,0.95),(3,0.90),(4,0.95),(5,0.85),(6,0.70);

  -- Base daily check-in target per gym (tuned for ~27K total over 90 days)
  CREATE TEMP TABLE _gym_base (gym_id UUID, base INT);
  INSERT INTO _gym_base
  SELECT g.id,
    CASE
      WHEN g.name ILIKE '%Bandra%'    THEN 55
      WHEN g.name ILIKE '%Powai%'     THEN 46
      WHEN g.name ILIKE '%Lajpat%'    THEN 42
      WHEN g.name ILIKE '%Connaught%' THEN 37
      WHEN g.name ILIKE '%Indiranagar%' THEN 39
      WHEN g.name ILIKE '%Koramangala%' THEN 35
      WHEN g.name ILIKE '%Banjara%'   THEN 30
      WHEN g.name ILIKE '%Noida%'     THEN 28
      WHEN g.name ILIKE '%Salt Lake%' THEN 23
      WHEN g.name ILIKE '%Velachery%' THEN 21
    END
  FROM gyms g;

  -- Active member pool per gym (only active members have regular check-ins)
  CREATE TEMP TABLE _mpool (gym_id UUID, mid UUID, rn INT);
  INSERT INTO _mpool
  SELECT gym_id, id,
    ROW_NUMBER() OVER (PARTITION BY gym_id ORDER BY random())
  FROM members WHERE status = 'active';

  -- Massive batch: all 89 days of historical checkins (fully closed)
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT
    mp.mid,
    gb.gym_id,
    (v_today - dd.d)
      + INTERVAL '1 hour' * hm.h
      + INTERVAL '1 minute' * floor(random() * 55),
    (v_today - dd.d)
      + INTERVAL '1 hour' * hm.h
      + INTERVAL '1 minute' * floor(random() * 55)
      + INTERVAL '1 minute' * floor(45 + random() * 45)
  FROM _gym_base gb
  CROSS JOIN generate_series(1, 89) AS dd(d)
  CROSS JOIN _hmult hm
  JOIN _dmult dm ON dm.d = EXTRACT(DOW FROM (v_today - dd.d))::INT
  JOIN _mpool mp  ON mp.gym_id = gb.gym_id
  WHERE hm.m > 0
    AND mp.rn <= GREATEST(1, ROUND(gb.base * hm.m * dm.m)::INT);

  -- Initial sync of last_checkin_at (before anomaly scenarios override some)
  UPDATE members m SET last_checkin_at = sub.max_ci
  FROM (
    SELECT member_id, MAX(checked_in) AS max_ci
    FROM checkins GROUP BY member_id
  ) sub
  WHERE m.id = sub.member_id;

  SELECT COUNT(*) INTO v_count FROM checkins;
  RAISE NOTICE '  Historical checkins seeded: %', v_count;

  ----------------------------------------------------------------
  -- PHASE 4: ANOMALY A — Velachery (zero open checkins)
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 4: Anomaly A — Velachery zero open checkins...';

  -- Close all Velachery open checkins
  UPDATE checkins SET checked_out = checked_in + INTERVAL '60 minutes'
    WHERE gym_id = v_velachery_id AND checked_out IS NULL;

  -- Delete any Velachery checkins within last 2h 10m so anomaly detector fires
  DELETE FROM checkins
    WHERE gym_id = v_velachery_id
      AND checked_in > v_now - INTERVAL '2 hours 10 minutes';

  ----------------------------------------------------------------
  -- PHASE 5: ANOMALY B — Bandra West capacity breach (280 open)
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 5: Anomaly B — Bandra 280 open checkins (91-94% of 300)...';

  -- First close any existing open Bandra checkins (from historical)
  UPDATE checkins SET checked_out = checked_in + INTERVAL '60 minutes'
    WHERE gym_id = v_bandra_id AND checked_out IS NULL;

  -- Insert 280 open checkins (91-94% of 300 cap → well above 90% breach threshold)
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, v_bandra_id,
    v_now - INTERVAL '1 minute' * floor(random() * 85),
    NULL
  FROM members m
  WHERE m.gym_id = v_bandra_id AND m.status = 'active'
  ORDER BY random()
  LIMIT 280;

  ----------------------------------------------------------------
  -- PHASE 6: Seed-time open checkins for remaining gyms
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 6: Open checkins for all other gyms...';

  -- Close any remaining open checkins (excluding Bandra which was just set)
  UPDATE checkins SET checked_out = checked_in + INTERVAL '60 minutes'
    WHERE gym_id != v_bandra_id AND checked_out IS NULL;

  -- Powai (large, 250 cap): 30 open = 12% occupancy (spec: 25-35)
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id,
    v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m
  WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Powai%')
    AND m.status = 'active'
  ORDER BY random() LIMIT 30;

  -- Lajpat Nagar (medium, 220 cap): 20 open = 9% occupancy (spec: 15-25)
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id,
    v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m
  WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Lajpat%')
    AND m.status = 'active'
  ORDER BY random() LIMIT 20;

  -- Connaught Place (medium, 180 cap): 18 open = 10% (spec: 15-25)
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id,
    v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m
  WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Connaught%')
    AND m.status = 'active'
  ORDER BY random() LIMIT 18;

  -- Indiranagar (medium, 200 cap): 20 open = 10% (spec: 15-25)
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id,
    v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m
  WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Indiranagar%')
    AND m.status = 'active'
  ORDER BY random() LIMIT 20;

  -- Koramangala (medium, 180 cap): 18 open = 10% (spec: 15-25)
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id,
    v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m
  WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Koramangala%')
    AND m.status = 'active'
  ORDER BY random() LIMIT 18;

  -- Banjara Hills (medium, 160 cap): 16 open = 10% (spec: 15-25)
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id,
    v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m
  WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Banjara%')
    AND m.status = 'active'
  ORDER BY random() LIMIT 16;

  -- Sector 18 Noida (small, 140 cap): 12 open = 9% (spec: 8-15)
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id,
    v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m
  WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Noida%')
    AND m.status = 'active'
  ORDER BY random() LIMIT 12;

  -- Salt Lake (small, 120 cap): 10 open = 8% (spec: 8-15)
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT m.id, m.gym_id,
    v_now - INTERVAL '1 minute' * floor(random() * 60), NULL
  FROM members m
  WHERE m.gym_id = (SELECT id FROM gyms WHERE name ILIKE '%Salt Lake%')
    AND m.status = 'active'
  ORDER BY random() LIMIT 10;

  -- Velachery: 0 open checkins (already enforced in Phase 4)

  ----------------------------------------------------------------
  -- PHASE 7: PAYMENTS
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 7: Seeding payments...';

  -- First payment for every member (tied to joined_at)
  INSERT INTO payments (member_id, gym_id, amount, plan_type, payment_type, paid_at)
  SELECT
    m.id, m.gym_id,
    CASE m.plan_type
      WHEN 'monthly'   THEN 1499.00
      WHEN 'quarterly' THEN 3999.00
      ELSE                  11999.00
    END,
    m.plan_type, 'new',
    m.joined_at + INTERVAL '1 minute' * floor(random() * 5)
  FROM members m;

  -- Renewal payment for renewal members whose renewal date has passed
  INSERT INTO payments (member_id, gym_id, amount, plan_type, payment_type, paid_at)
  SELECT
    m.id, m.gym_id,
    CASE m.plan_type
      WHEN 'monthly'   THEN 1499.00
      WHEN 'quarterly' THEN 3999.00
      ELSE                  11999.00
    END,
    m.plan_type, 'renewal',
    m.joined_at + CASE m.plan_type
      WHEN 'monthly'   THEN INTERVAL '30 days'
      WHEN 'quarterly' THEN INTERVAL '90 days'
      ELSE                  INTERVAL '365 days'
    END
  FROM members m
  WHERE m.member_type = 'renewal'
    AND (m.joined_at + CASE m.plan_type
      WHEN 'monthly'   THEN INTERVAL '30 days'
      WHEN 'quarterly' THEN INTERVAL '90 days'
      ELSE                  INTERVAL '365 days'
    END) <= v_now;

  SELECT COUNT(*) INTO v_count FROM payments;
  RAISE NOTICE '  Payments seeded: %', v_count;

  ----------------------------------------------------------------
  -- PHASE 8: ANOMALY C — Salt Lake revenue drop
  -- Today: ≤ ₹3,000 | Same day last week: ≥ ₹15,000
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 8: Anomaly C — Salt Lake revenue drop...';

  -- Remove any Salt Lake payments dated today
  DELETE FROM payments
    WHERE gym_id = v_saltlake_id AND paid_at::DATE = v_today;

  -- Seed 1 payment today (₹1,499 ≤ ₹3,000 threshold)
  INSERT INTO payments (member_id, gym_id, amount, plan_type, payment_type, paid_at)
  SELECT m.id, m.gym_id, 1499.00, 'monthly', 'new',
    v_today + INTERVAL '9 hours'
  FROM members m
  WHERE m.gym_id = v_saltlake_id AND m.status = 'active'
  ORDER BY random() LIMIT 1;

  -- Seed 12 payments on the same weekday last week (12 × ₹1,499 = ₹17,988 ≥ ₹15,000)
  INSERT INTO payments (member_id, gym_id, amount, plan_type, payment_type, paid_at)
  SELECT
    m.id, m.gym_id, 1499.00, 'monthly', 'new',
    (v_today - INTERVAL '7 days') +
      INTERVAL '1 hour' * (8 + (ROW_NUMBER() OVER (ORDER BY random())) % 10)
  FROM members m
  WHERE m.gym_id = v_saltlake_id AND m.status = 'active'
  ORDER BY random() LIMIT 12;

  ----------------------------------------------------------------
  -- PHASE 9: Churn risk population
  -- SPEC §3.3 CRITICAL: last_checkin_at MUST equal MAX(checked_in) in checkins table
  -- Strategy:
  --   1. Pick active members with recent activity
  --   2. Delete their checkins that are more recent than the churn timestamp
  --      (so the churn row becomes their actual most-recent checkin)
  --   3. Insert a real closed checkin at the churn timestamp
  --   4. Final sync: UPDATE last_checkin_at = MAX(checked_in) from checkins
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 9: Building churn risk population (with real checkin rows)...';

  -- Temp table: pick 250 high-risk candidates → will have last checkin 45-60 days ago
  CREATE TEMP TABLE _high_risk AS
  SELECT id, gym_id,
    v_now - INTERVAL '1 day' * (45 + floor(random() * 15)) AS churn_ts
  FROM (
    SELECT id, gym_id,
      ROW_NUMBER() OVER (ORDER BY random()) AS rn
    FROM members
    WHERE status = 'active'
      AND last_checkin_at > v_now - INTERVAL '44 days'
  ) ranked
  WHERE rn <= 250;

  -- Temp table: pick 120 critical-risk candidates → will have last checkin 61-85 days ago
  -- Exclude members already in _high_risk
  CREATE TEMP TABLE _critical_risk AS
  SELECT id, gym_id,
    v_now - INTERVAL '1 day' * (61 + floor(random() * 25)) AS churn_ts
  FROM (
    SELECT m.id, m.gym_id,
      ROW_NUMBER() OVER (ORDER BY random()) AS rn
    FROM members m
    WHERE m.status = 'active'
      AND m.last_checkin_at > v_now - INTERVAL '44 days'
      AND NOT EXISTS (SELECT 1 FROM _high_risk hr WHERE hr.id = m.id)
  ) ranked
  WHERE rn <= 120;

  -- CRITICAL FIX: Delete any historical checkins for churn members that are
  -- MORE RECENT than their assigned churn_ts. Without this delete, the final
  -- MAX(checked_in) sync would pick the recent historical row (not churn_ts),
  -- leaving last_checkin_at inconsistent with the churn target.
  DELETE FROM checkins c
    USING _high_risk hr
    WHERE c.member_id = hr.id
      AND c.checked_in > hr.churn_ts;

  DELETE FROM checkins c
    USING _critical_risk cr
    WHERE c.member_id = cr.id
      AND c.checked_in > cr.churn_ts;

  -- Insert REAL closed checkin rows at the churn timestamps
  -- These become the members' most-recent checkin records
  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT id, gym_id, churn_ts,
    churn_ts + INTERVAL '1 minute' * floor(45 + random() * 45)
  FROM _high_risk;

  INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
  SELECT id, gym_id, churn_ts,
    churn_ts + INTERVAL '1 minute' * floor(45 + random() * 45)
  FROM _critical_risk;

  -- FINAL SYNC: set last_checkin_at = MAX(checked_in) for ALL members.
  -- For churn members: picks the churn_ts (their new most-recent row).
  -- For healthy members: picks their most recent historical checkin.
  UPDATE members m SET last_checkin_at = sub.max_ci
  FROM (
    SELECT member_id, MAX(checked_in) AS max_ci
    FROM checkins
    GROUP BY member_id
  ) sub
  WHERE m.id = sub.member_id;

  -- Members with NO checkin at all → NULL (edge case guard)
  UPDATE members SET last_checkin_at = NULL
  WHERE last_checkin_at IS NOT NULL
    AND id NOT IN (SELECT DISTINCT member_id FROM checkins);

  ----------------------------------------------------------------
  -- PHASE 10: Refresh materialized view
  ----------------------------------------------------------------
  RAISE NOTICE 'Phase 10: Refreshing materialized view...';
  REFRESH MATERIALIZED VIEW gym_hourly_stats;

  ----------------------------------------------------------------
  -- VALIDATION SUMMARY (printed to Docker logs)
  ----------------------------------------------------------------
  RAISE NOTICE '=== VALIDATION ===';

  SELECT COUNT(*) INTO v_count FROM gyms;
  RAISE NOTICE 'V1  Gyms: % (expect 10)', v_count;

  SELECT COUNT(*) INTO v_count FROM members;
  RAISE NOTICE 'V2  Members: % (expect 5000)', v_count;

  SELECT COUNT(*) INTO v_count FROM members WHERE status = 'active';
  RAISE NOTICE 'V3  Active members: % (expect 4100-4400)', v_count;

  SELECT COUNT(*) INTO v_count FROM checkins;
  RAISE NOTICE 'V4  Checkins: % (expect 250000-300000)', v_count;

  SELECT COUNT(*) INTO v_count FROM checkins WHERE checked_out IS NULL;
  RAISE NOTICE 'V5  Open checkins: % (expect 100-350)', v_count;

  SELECT COUNT(*) INTO v_count FROM payments;
  RAISE NOTICE 'V6  Payments: % (expect 5000-6000)', v_count;

  SELECT COUNT(*) INTO v_count FROM members
    WHERE last_checkin_at < v_now - INTERVAL '45 days' AND status = 'active';
  RAISE NOTICE 'V7  Churn risk 45+ days: % (expect >= 230)', v_count;

  SELECT COUNT(*) INTO v_count FROM checkins
    WHERE gym_id = v_bandra_id AND checked_out IS NULL;
  RAISE NOTICE 'V8  Bandra open: % (expect 270-300)', v_count;

  SELECT COUNT(*) INTO v_count FROM checkins
    WHERE gym_id = v_velachery_id AND checked_out IS NULL;
  RAISE NOTICE 'V9  Velachery open: % (expect 0)', v_count;

  SELECT COALESCE(SUM(amount), 0) INTO v_bandra_rev
    FROM payments
    WHERE gym_id = v_bandra_id AND paid_at >= v_now - INTERVAL '30 days';
  RAISE NOTICE 'V10 Bandra 30d revenue: ₹% (expect 350000-550000)', v_bandra_rev;

  -- Consistency check: churn members must have matching checkin rows
  SELECT COUNT(*) INTO v_count
    FROM members m
    WHERE m.status = 'active'
      AND m.last_checkin_at < v_now - INTERVAL '45 days'
      AND NOT EXISTS (
        SELECT 1 FROM checkins c
        WHERE c.member_id = m.id
          AND c.checked_in = m.last_checkin_at
      );
  RAISE NOTICE 'V11 Churn members missing matching checkin row: % (expect 0)', v_count;

  RAISE NOTICE '=== SEED COMPLETE ===';

  DROP TABLE IF EXISTS _fnames, _lnames, _gymspec, _member_staging,
                       _hmult, _dmult, _gym_base, _mpool,
                       _high_risk, _critical_risk;
END $$;
