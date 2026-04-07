# WTF LivePulse — Real-Time Multi-Gym Intelligence Engine

> A production-grade, real-time operations dashboard for WTF Gyms — monitoring live occupancy, revenue, anomalies, and analytics across 10 gym locations.

![Stack](https://img.shields.io/badge/React_18-61DAFB?style=flat&logo=react&logoColor=black) ![Node](https://img.shields.io/badge/Node.js_20-339933?style=flat&logo=node.js&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL_15-4169E1?style=flat&logo=postgresql&logoColor=white) ![Docker](https://img.shields.io/badge/Docker_Compose-2496ED?style=flat&logo=docker&logoColor=white)

---

## 1. Quick Start (Zero-Config)

> [!IMPORTANT]
> **Single Command Startup**
> Run the following command from the root of the project to start the entire system (Database, Backend, Frontend). The database will automatically seed itself.

```bash
docker compose up
```

✨ **That's it.** No manual migrations, no npm installs, no setup required. The system boots entirely on its own.

- **Dashboard**: http://localhost:3000
- **API**: http://localhost:3001/api
- **WebSocket**: ws://localhost:3001/ws

> [!NOTE]
> **Prerequisites**: Docker Desktop must be installed and running.

The database seeds automatically on first launch (~60s for 270K+ records). The anomaly detector fires immediately on startup — you should see anomaly alerts within 30 seconds (Velachery zero check-ins, Bandra capacity breach, Salt Lake revenue drop).

### Cold Start Verification

> [!TIP]
> **To verify a completely fresh start, use:**
> ```bash
> docker compose down -v  # Remove volumes for fresh start
> docker compose up       # Should work with zero manual steps
> ```

---

## 2. Architecture Decisions

### Database Indexing Strategy

| Index | Type | Why |
|-------|------|-----|
| `idx_checkins_live_occupancy` | **Partial B-Tree** (`WHERE checked_out IS NULL`) | The most frequent query (Q1). Partial index keeps only ~300 active rows indexed instead of 270K+, making live occupancy O(1). Index Only Scan — zero heap fetches. |
| `idx_checkins_time_brin` | **BRIN** (Block Range Index) | Checkins are append-only/time-series. BRIN is 100x smaller than B-Tree for time-range queries on large tables. |
| `idx_payments_gym_date` | **Composite B-Tree** (`gym_id, paid_at DESC`) | Covers both the single-gym revenue (Q2) and date-filtered revenue queries. Uses Bitmap Index Scan to avoid Seq Scan on payments. |
| `idx_payments_date` | **B-Tree** (`paid_at DESC`) | Covers cross-gym revenue comparison (Q5). Bitmap Index Scan filters by date range, then HashAggregate groups by gym_id. |
| `idx_members_churn_risk` | **Partial B-Tree** (`WHERE status = 'active'`) | Only indexes active members (Q3), making churn detection fast even with 5K total members. |
| `idx_anomalies_active` | **Partial B-Tree** (`WHERE resolved = FALSE`) | Active anomalies are always a small set. Partial index keeps the index tiny. |
| `idx_anomalies_active_global` | **Partial B-Tree** (`detected_at DESC WHERE resolved = FALSE`) | Covers Q6 query with pre-sorted order — avoids any sequential scan and eliminates sort step. |
| `gym_hourly_stats` | **Materialized View** + unique index | Pre-aggregates 7-day heatmap data (Q4). Refreshed every 15 minutes. Query time ~0.2ms vs ~50ms raw GROUP BY. |

### Why WebSocket over Polling
- Real-time requirement: UI must update within 1 second of events.
- Server pushes 5 event types: `CHECKIN_EVENT`, `CHECKOUT_EVENT`, `PAYMENT_EVENT`, `ANOMALY_DETECTED`, `ANOMALY_RESOLVED`
- `INITIAL_SNAPSHOT` sent on connection for immediate data display
- Native `ws` package — no socket.io overhead
- Pulsing green dot indicator when connected; red when disconnected

> [!TIP]
> **Testing Offline Mode Locally:**
> Because the application relies on your computer's internal network to communicate (`localhost`), disconnecting from Wi-Fi will NOT trigger the offline state. To accurately test the live status indicator changing to "OFFLINE", you must either:
> 1. In your browser (F12) -> Network tab -> Change throttling from "No throttling" to **"Offline"**.
> 2. Manually stop the backend container: `docker stop wtfassi-backend-1`.

### Anomaly Detection Engine
- Background job runs every 30 seconds via `setInterval`
- 3 anomaly types with auto-resolve logic:
  - **Zero Check-ins**: Active gym + no checkins for 2+ hours during operating hours → auto-resolves when a checkin occurs
  - **Capacity Breach**: Occupancy > 90% of capacity → auto-resolves when occupancy drops below 85%
  - **Revenue Drop**: Today's revenue < 70% of same day last week → auto-resolves when revenue recovers within 20%
- Resolved anomalies remain visible for 24 hours, then auto-archived

### Seed Script Design
- PL/pgSQL function using `generate_series()` and `INSERT...SELECT` for batch performance
- Realistic hourly/daily traffic multipliers (peak 6–9am, 5–8pm; lower midday; minimal overnight)
- 3 pre-built anomaly scenarios (Velachery zero checkins, Bandra 280 open = capacity breach, Salt Lake revenue drop)
- Idempotent: checks `SELECT COUNT(*) FROM gyms` before inserting

---

## 3. AI Tools Used

| Tool | Used For |
|------|----------|
| **Claude Sonnet (Free Version)** | Heavy usage for full system architecture, boilerplate, code generation for backend services, React components, SQL schema with all indexes, PL/pgSQL seed script execution |
| **ChatGPT Go** | Used for understanding the core system requirements, mapping data flow, and high-level architectural planning |
| **Gemini** | Assisted in debugging (powered by Antigravity), refining error handling, test creation (Jest, Playwright), Docker optimization |
| **Manual Review & Validation** | Anomaly detection business logic validation, query performance tuning with EXPLAIN ANALYZE, structuring of the data distribution patterns for seed script |

AI was heavily leveraged as a **force multiplier** to compress 3 days of traditional engineering into 3 hours. Architecture, schema design, boilerplate, and routing were AI-generated. All business logic (anomaly thresholds, hourly multipliers, seed anomaly scenarios) was reviewed and mapped back to the PRD specifications to ensure strict compliance.

---

## 4. Query Benchmarks

Measured on seeded local dataset (5,000 members, ~270K checkins, 90 days) using `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)`:

| # | Query | Measured Time | Target | Index / Plan | Status |
|---|-------|--------------|--------|-------------|--------|
| Q1 | Live Occupancy (single gym) | **0.236ms** | < 0.5ms | `idx_checkins_live_occupancy` → Index Only Scan | ✅ PASS |
| Q2 | Today's Revenue (single gym) | **0.209ms** | < 0.8ms | `idx_payments_gym_date` → Bitmap Index Scan | ✅ PASS |
| Q3 | Churn Risk Members | **0.200ms** | < 1ms | `idx_members_churn_risk` → Bitmap Index Scan | ✅ PASS |
| Q4 | Peak Hour Heatmap (7d) | **0.217ms** | < 0.3ms | `idx_gym_hourly_stats_unique` → Bitmap Index Scan | ✅ PASS |
| Q5 | Cross-Gym Revenue (30d) | **1.205ms** | < 2ms | `idx_payments_date` → Bitmap Index Scan + HashAggregate | ✅ PASS |
| Q6 | Active Anomalies (all gyms) | **0.141ms** | < 0.3ms | `idx_anomalies_active_global` → Index Scan | ✅ PASS |

**No sequential scans on checkins or payments tables.** All 6 queries use index scans. EXPLAIN ANALYZE output files are in [`/benchmarks/screenshots/`](benchmarks/screenshots/).

To verify yourself:
```sql
-- Connect to database
docker exec -it <db_container> psql -U wtf wtf_livepulse

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

- **Materialized View Refresh**: Uses `REFRESH MATERIALIZED VIEW CONCURRENTLY` every 15 minutes. Heatmap data may be slightly stale between refreshes.
- **Simulator Realism**: Generates events at fixed intervals per speed multiplier. Real-world traffic would be more varied and bursty.
- **No Authentication**: No auth/authorization layer — this is a local development assignment per spec.
- **No Mobile Layout**: Dashboard is optimized for 1280px+ width as specified. No mobile responsive layout needed.
- **Playwright Tests**: Require running services (via `docker compose up`) before execution.
- **Time Zone**: Seed script uses server-local timezone. Anomaly detection for operating hours uses PostgreSQL `CURRENT_TIME` which respects the container timezone.

---

## Running Tests

> [!IMPORTANT]
> **Test Execution Rules** 
> Reviewers should run these identical commands to properly validate both layers of the application. Make sure the Node container dependencies installed natively on your local machine if running these locally outside of docker.

### Backend (Unit + Integration)

> [!TIP]
> Run this command from the project root:
> ```bash
> cd backend && npm test
> ```

- **13 unit tests** — anomaly detection logic (zero checkins, capacity breach, revenue drop, auto-resolve, dismiss)
- **9 unit tests** — simulator service (start/stop/reset, event generation, checkin/checkout/payment simulation)
- **28 integration tests** — API endpoints (all routes, status codes, validation, structure)
- **Total: 50 tests**
- Coverage report generated in `backend/coverage/`

### Frontend (E2E — Playwright)

> [!WARNING]
> Please ensure that the services (`docker compose up`) are fully running in another terminal before executing the E2E tests, otherwise they will fail to connect to the backend.

> [!TIP]
> Run this command from the project root:
> ```bash
> cd frontend && npx playwright test
> ```

- 4 E2E tests (dashboard load, gym switch, simulator activity, anomaly badge)
- Requires `docker compose up` running first

---

## Project Structure

```
wtf-livepulse/
├── docker-compose.yml          # Single file to start entire stack
├── .env.example                # All environment variables documented
├── README.md                   # Setup + architecture + AI tools used
│
├── backend/
│   ├── src/
│   │   ├── routes/             # Express route handlers (gyms, analytics, anomalies, simulator)
│   │   ├── services/           # Business logic (anomalyService, simulatorService, statsService)
│   │   ├── db/
│   │   │   ├── migrations/     # SQL files: 001_schema, 002_indexes, 003_matview, 004_seed, 005_anomalies_index
│   │   │   ├── seeds/          # Seed documentation
│   │   │   └── pool.js         # pg Pool singleton
│   │   ├── jobs/               # Background jobs (anomalyDetector — runs every 30s)
│   │   ├── websocket/          # WebSocket server + broadcast logic
│   │   └── app.js              # Express app entry point
│   ├── tests/
│   │   ├── unit/               # Jest unit tests (anomaly detection + simulator)
│   │   └── integration/        # Supertest integration tests (API endpoints)
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/         # Reusable UI components (AnimatedNumber)
│   │   ├── pages/              # Page-level components (Dashboard, Analytics, Anomalies)
│   │   ├── hooks/              # Custom hooks (useWebSocket)
│   │   ├── store/              # State management (React Context — StoreContext)
│   │   └── main.jsx
│   ├── tests/                  # Playwright E2E tests
│   └── package.json
│
└── benchmarks/
    └── screenshots/            # EXPLAIN ANALYZE output for all 6 benchmark queries
```
