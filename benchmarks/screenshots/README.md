# Benchmarks

This directory contains EXPLAIN ANALYZE output screenshots for all 6 benchmark queries.

## How to capture

1. Run `docker compose up` and wait for seed to complete
2. Connect to the database: `docker exec -it <db_container> psql -U wtf wtf_livepulse`
3. Run each benchmark query with: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) <query>`
4. Screenshot the output and save here

## Queries to benchmark

| # | Query | Target Time |
|---|-------|------------|
| Q1 | `SELECT COUNT(*) FROM checkins WHERE gym_id = $1 AND checked_out IS NULL` | < 0.5ms |
| Q2 | `SELECT SUM(amount) FROM payments WHERE gym_id = $1 AND paid_at >= CURRENT_DATE` | < 0.8ms |
| Q3 | `SELECT id, name, last_checkin_at FROM members WHERE status='active' AND last_checkin_at < NOW() - INTERVAL '45 days'` | < 1ms |
| Q4 | `SELECT * FROM gym_hourly_stats WHERE gym_id = $1` | < 0.3ms |
| Q5 | `SELECT gym_id, SUM(amount) FROM payments WHERE paid_at >= NOW() - INTERVAL '30 days' GROUP BY gym_id ORDER BY SUM DESC` | < 2ms |
| Q6 | `SELECT * FROM anomalies WHERE resolved = FALSE ORDER BY detected_at DESC` | < 0.3ms |
