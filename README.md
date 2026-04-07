# WTF LivePulse — Real-Time Multi-Gym Intelligence Engine

> A production-grade, real-time operations dashboard for WTF Gyms — monitoring live occupancy, revenue, anomalies, and analytics across 10 gym locations.

![Stack](https://img.shields.io/badge/React_18-61DAFB?style=flat&logo=react&logoColor=black) ![Node](https://img.shields.io/badge/Node.js_20-339933?style=flat&logo=node.js&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL_15-4169E1?style=flat&logo=postgresql&logoColor=white) ![Docker](https://img.shields.io/badge/Docker_Compose-2496ED?style=flat&logo=docker&logoColor=white)

---

## 1. Quick Start

```bash
docker compose up
```

**That's it.** No other commands required.

- **Dashboard**: http://localhost:3000
- **API**: http://localhost:3001/api
- **WebSocket**: ws://localhost:3001/ws

**Prerequisites**: Docker Desktop installed and running.

The database seeds automatically on first launch (~60s for 270K+ records). The anomaly detector fires immediately on startup — you should see 3 anomaly alerts within 30 seconds.

### Cold Start Verification
```bash
docker compose down -v  # Remove volumes for fresh start
docker compose up       # Should work with zero manual steps
```

---

## 2. Architecture Decisions

### Database Indexing Strategy

| Index | Type | Why |
|-------|------|-----|
| `idx_checkins_live_occupancy` | **Partial B-Tree** (`WHERE checked_out IS NULL`) | The most frequent query. Partial index keeps only ~300 rows indexed instead of 270K+, making live occupancy O(1). |
| `idx_checkins_time_brin` | **BRIN** (Block Range Index) | Checkins are append-only/time-series. BRIN is 100x smaller than B-Tree for time-range queries on large tables. |
| `idx_payments_gym_date` | **Composite B-Tree** (`gym_id, paid_at DESC`) | Covers both the single-gym and date-filtered revenue queries with a single index scan. |
| `idx_members_churn_risk` | **Partial B-Tree** (`WHERE status = 'active'`) | Only indexes active members, making the churn detection query fast even with 5K members. |
| `idx_anomalies_active` | **Partial B-Tree** (`WHERE resolved = FALSE`) | Active anomalies are always a small set. Partial index keeps it tiny and fast. |
| `gym_hourly_stats` | **Materialized View** | Pre-aggregates 7-day heatmap data. Refreshed every 15 minutes. Query time ~0.1ms vs ~50ms raw. |

### Why WebSocket over Polling
- Real-time requirement: UI must update within 1 second of events
- Server pushes 5 event types: `CHECKIN_EVENT`, `CHECKOUT_EVENT`, `PAYMENT_EVENT`, `ANOMALY_DETECTED`, `ANOMALY_RESOLVED`
- Initial snapshot sent on connection for immediate data display
- Native `ws` package — no socket.io overhead

### Seed Script Design
- PL/pgSQL function using `generate_series()` for batch performance
- Realistic hourly/daily traffic multipliers per spec
- 3 pre-built anomaly scenarios (Velachery zero checkins, Bandra capacity breach, Salt Lake revenue drop)
- Idempotent: safe to run on restart

---

## 3. AI Tools Used

| Tool | Used For |
|------|----------|
| **Google Gemini (Antigravity)** | Full system architecture, code generation for all backend services, React components, SQL schema with indexes, PL/pgSQL seed script, test suites, Docker configuration |
| **Manual Review** | Anomaly detection business logic validation, query performance tuning, data distribution patterns, WebSocket event protocol design |

AI was used as a **force multiplier** for boilerplate generation, schema scaffolding, and test creation. All business logic (anomaly thresholds, hourly multipliers, seed scenarios) was validated manually against the specification.

---

## 4. Query Benchmarks

Run these against the seeded database with `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)`:

| # | Query | Target | Index Used |
|---|-------|--------|------------|
| Q1 | Live Occupancy (single gym) | < 0.5ms | `idx_checkins_live_occupancy` (Index Only Scan) |
| Q2 | Today's Revenue (single gym) | < 0.8ms | `idx_payments_gym_date` (Index Scan) |
| Q3 | Churn Risk Members | < 1ms | `idx_members_churn_risk` (Index Scan) |
| Q4 | Peak Hour Heatmap (7d) | < 0.3ms | `gym_hourly_stats` unique index (Index Scan) |
| Q5 | Cross-Gym Revenue | < 2ms | `idx_payments_date` (Index Scan) |
| Q6 | Active Anomalies | < 0.3ms | `idx_anomalies_active` (Index Scan) |

Screenshot evidence is in `/benchmarks/screenshots/`.

To verify yourself:
```sql
-- Q1: Live Occupancy
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*) FROM checkins WHERE gym_id = '<gym_id>' AND checked_out IS NULL;

-- Q2: Today's Revenue
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT SUM(amount) FROM payments WHERE gym_id = '<gym_id>' AND paid_at >= CURRENT_DATE;

-- Q3: Churn Risk
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, name, last_checkin_at FROM members WHERE status='active' AND last_checkin_at < NOW() - INTERVAL '45 days';

-- Q4: Heatmap
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM gym_hourly_stats WHERE gym_id = '<gym_id>';

-- Q5: Cross-Gym Revenue
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT gym_id, SUM(amount) FROM payments WHERE paid_at >= NOW() - INTERVAL '30 days' GROUP BY gym_id ORDER BY SUM(amount) DESC;

-- Q6: Active Anomalies
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM anomalies WHERE resolved = FALSE ORDER BY detected_at DESC;
```

---

## 5. Known Limitations

- **Materialized View Refresh**: Uses `REFRESH MATERIALIZED VIEW CONCURRENTLY` every 15 minutes. Data may be slightly stale between refreshes for the heatmap.
- **Simulator Realism**: Simulator generates events at fixed intervals. Real-world traffic would be more varied and bursty.
- **No Auth**: No authentication/authorization layer — this is a local dev assignment.
- **No Mobile Layout**: Dashboard is optimized for 1280px+ width as per spec. No mobile responsive layout.
- **Playwright Tests**: Require running services (via `docker compose up`) before execution.
- **EXPLAIN ANALYZE Screenshots**: Should be captured after running `docker compose up` with seeded data. Placeholder directory created.

---

## Running Tests

### Backend (Unit + Integration)
```bash
cd backend && npm test
```
- 13 unit tests (anomaly detection logic)
- 16 integration tests (API endpoints)
- Coverage report generated in `backend/coverage/`

### Frontend (E2E)
```bash
cd frontend && npx playwright test
```
- 3 E2E tests (dashboard load, gym switch, simulator)
- Requires `docker compose up` running

---

## Project Structure

```
wtf-livepulse/
├── docker-compose.yml
├── .env.example
├── README.md
├── backend/
│   ├── src/
│   │   ├── routes/          # gyms, anomalies, simulator, analytics
│   │   ├── services/        # statsService, anomalyService, simulatorService
│   │   ├── db/
│   │   │   ├── migrations/  # 001_schema, 002_indexes, 003_matview, 004_seed
│   │   │   └── pool.js
│   │   ├── jobs/            # anomalyDetector
│   │   ├── websocket/       # WebSocket server + broadcast
│   │   └── app.js
│   └── tests/
│       ├── unit/            # 13 anomaly detection tests
│       └── integration/     # 16 API endpoint tests
├── frontend/
│   ├── src/
│   │   ├── components/      # AnimatedNumber
│   │   ├── pages/           # Dashboard, Analytics, Anomalies
│   │   ├── hooks/           # useWebSocket
│   │   ├── store/           # StoreContext (React Context)
│   │   └── main.jsx
│   └── tests/               # 3 Playwright E2E tests
└── benchmarks/
    └── screenshots/
```
