-- 002_indexes.sql — Performance indexes for WTF LivePulse

-- Partial index for churn risk detection (active members only)
CREATE INDEX IF NOT EXISTS idx_members_churn_risk
  ON members (last_checkin_at)
  WHERE status = 'active';

-- Supporting index for gym-level member queries
CREATE INDEX IF NOT EXISTS idx_members_gym_id ON members (gym_id);

-- BRIN index for time-series range queries on checkins (optimal for append-only)
CREATE INDEX IF NOT EXISTS idx_checkins_time_brin ON checkins USING BRIN (checked_in);

-- Composite partial index for live occupancy (most frequent query)
CREATE INDEX IF NOT EXISTS idx_checkins_live_occupancy
  ON checkins (gym_id, checked_out)
  WHERE checked_out IS NULL;

-- Index for member-level checkin history
CREATE INDEX IF NOT EXISTS idx_checkins_member ON checkins (member_id, checked_in DESC);

-- Composite index for today's revenue query
CREATE INDEX IF NOT EXISTS idx_payments_gym_date
  ON payments (gym_id, paid_at DESC);

-- Supporting index for cross-gym revenue comparison
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (paid_at DESC);

-- Partial index for active anomalies (small index, very fast)
CREATE INDEX IF NOT EXISTS idx_anomalies_active
  ON anomalies (gym_id, detected_at DESC)
  WHERE resolved = FALSE;
