-- 001_schema.sql — Core tables for WTF LivePulse
-- Runs automatically via /docker-entrypoint-initdb.d/ on first DB init

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

------------------------------------------------------------
-- GYMS
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gyms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  address     TEXT,
  capacity    INTEGER NOT NULL CHECK (capacity > 0),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  opens_at    TIME NOT NULL DEFAULT '06:00',
  closes_at   TIME NOT NULL DEFAULT '22:00',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

------------------------------------------------------------
-- MEMBERS
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id           UUID NOT NULL REFERENCES gyms(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  plan_type        TEXT NOT NULL CHECK (plan_type IN ('monthly', 'quarterly', 'annual')),
  member_type      TEXT NOT NULL DEFAULT 'new' CHECK (member_type IN ('new', 'renewal')),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'frozen')),
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  plan_expires_at  TIMESTAMPTZ NOT NULL,
  last_checkin_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

------------------------------------------------------------
-- CHECKINS
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkins (
  id           BIGSERIAL PRIMARY KEY,
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id       UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  checked_in   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_out  TIMESTAMPTZ,
  duration_min INTEGER GENERATED ALWAYS AS (
    CASE WHEN checked_out IS NOT NULL
    THEN EXTRACT(EPOCH FROM (checked_out - checked_in))::INTEGER / 60
    ELSE NULL END
  ) STORED
);

------------------------------------------------------------
-- PAYMENTS
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id       UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  amount       NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  plan_type    TEXT NOT NULL,
  payment_type TEXT NOT NULL DEFAULT 'new' CHECK (payment_type IN ('new', 'renewal')),
  paid_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes        TEXT
);

------------------------------------------------------------
-- ANOMALIES
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anomalies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id       UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('zero_checkins', 'capacity_breach', 'revenue_drop')),
  severity     TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  message      TEXT NOT NULL,
  resolved     BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed    BOOLEAN NOT NULL DEFAULT FALSE,
  detected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);
