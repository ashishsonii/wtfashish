# Seed Data

The seed script is located at `../migrations/004_seed.sql` and runs automatically via PostgreSQL's `docker-entrypoint-initdb.d` mechanism on first database initialization.

## What it generates:
- **10 gym locations** with capacities ranging from 80–300
- **5,000 members** distributed across gyms with realistic plan types
- **~270,000 historical check-in records** spanning 90 days
- **5,000–6,000 payment records** with new and renewal types
- **3 pre-built anomaly scenarios:**
  - Velachery: zero open check-ins (triggers `zero_checkins` anomaly)
  - Bandra West: 280 open check-ins (triggers `capacity_breach` anomaly)
  - Salt Lake: minimal today's payments vs last week (triggers `revenue_drop` anomaly)

## Re-seeding

To re-seed the database from scratch:
```bash
docker compose down -v
docker compose up
```

The seed script is **idempotent** — it checks if gyms already exist before inserting.
