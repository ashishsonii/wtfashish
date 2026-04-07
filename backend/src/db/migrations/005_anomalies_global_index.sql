-- Global unresolved-anomalies index for all-gym ORDER BY detected_at DESC queries (Q6)
CREATE INDEX IF NOT EXISTS idx_anomalies_active_global
  ON anomalies (detected_at DESC)
  WHERE resolved = FALSE;
