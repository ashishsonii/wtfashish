const pool = require('../db/pool');

const anomalyService = {
  // Check all anomaly conditions and insert/resolve as needed
  async runDetection(broadcast) {
    await Promise.all([
      anomalyService.detectZeroCheckins(broadcast),
      anomalyService.detectCapacityBreach(broadcast),
      anomalyService.detectRevenueDrop(broadcast),
    ]);
  },

  // Anomaly Type 1: Zero check-ins for 2+ hours during operating hours
  async detectZeroCheckins(broadcast) {
    const { rows: gyms } = await pool.query(`
      SELECT g.id, g.name, g.opens_at, g.closes_at
      FROM gyms g
      WHERE g.status = 'active'
        AND CURRENT_TIME BETWEEN g.opens_at AND g.closes_at
        AND NOT EXISTS (
          SELECT 1 FROM checkins c
          WHERE c.gym_id = g.id AND c.checked_in >= NOW() - INTERVAL '2 hours'
        )
        AND NOT EXISTS (
          SELECT 1 FROM anomalies a
          WHERE a.gym_id = g.id AND a.type = 'zero_checkins' AND a.resolved = FALSE
        )
    `);

    for (const gym of gyms) {
      const message = `${gym.name} has had zero check-ins for over 2 hours during operating hours — possible system issue or closure`;
      const { rows } = await pool.query(
        `INSERT INTO anomalies (gym_id, type, severity, message) VALUES ($1, 'zero_checkins', 'warning', $2) RETURNING *`,
        [gym.id, message]
      );
      if (broadcast && rows[0]) {
        broadcast({
          type: 'ANOMALY_DETECTED',
          anomaly_id: rows[0].id,
          gym_id: gym.id,
          gym_name: gym.name,
          anomaly_type: 'zero_checkins',
          severity: 'warning',
          message,
        });
      }
    }

    // Auto-resolve: if a gym now has recent checkins
    const { rows: resolved } = await pool.query(`
      UPDATE anomalies a SET resolved = TRUE, resolved_at = NOW()
      WHERE a.type = 'zero_checkins' AND a.resolved = FALSE
        AND EXISTS (
          SELECT 1 FROM checkins c WHERE c.gym_id = a.gym_id AND c.checked_in >= NOW() - INTERVAL '2 hours'
        )
      RETURNING a.id, a.gym_id
    `);

    for (const r of resolved) {
      if (broadcast) {
        broadcast({ type: 'ANOMALY_RESOLVED', anomaly_id: r.id, gym_id: r.gym_id, resolved_at: new Date().toISOString() });
      }
    }
  },

  // Anomaly Type 2: Capacity breach (occupancy > 90%)
  async detectCapacityBreach(broadcast) {
    const { rows: gyms } = await pool.query(`
      SELECT g.id, g.name, g.capacity, COUNT(c.id)::INTEGER AS current_count
      FROM gyms g
      LEFT JOIN checkins c ON c.gym_id = g.id AND c.checked_out IS NULL
      WHERE g.status = 'active'
      GROUP BY g.id, g.name, g.capacity
      HAVING COUNT(c.id) >= g.capacity * 0.9
    `);

    for (const gym of gyms) {
      // Check if already flagged
      const { rows: existing } = await pool.query(
        `SELECT id FROM anomalies WHERE gym_id = $1 AND type = 'capacity_breach' AND resolved = FALSE`,
        [gym.id]
      );
      if (existing.length > 0) continue;

      const pct = Math.round((gym.current_count / gym.capacity) * 100);
      const message = `${gym.name} at ${pct}% capacity (${gym.current_count}/${gym.capacity}) — risk of overcrowding`;
      const { rows } = await pool.query(
        `INSERT INTO anomalies (gym_id, type, severity, message) VALUES ($1, 'capacity_breach', 'critical', $2) RETURNING *`,
        [gym.id, message]
      );
      if (broadcast && rows[0]) {
        broadcast({
          type: 'ANOMALY_DETECTED',
          anomaly_id: rows[0].id,
          gym_id: gym.id,
          gym_name: gym.name,
          anomaly_type: 'capacity_breach',
          severity: 'critical',
          message,
        });
      }
    }

    // Auto-resolve: occupancy below 85%
    const { rows: resolved } = await pool.query(`
      UPDATE anomalies a SET resolved = TRUE, resolved_at = NOW()
      WHERE a.type = 'capacity_breach' AND a.resolved = FALSE
        AND (
          SELECT COUNT(*) FROM checkins c WHERE c.gym_id = a.gym_id AND c.checked_out IS NULL
        ) < (SELECT g.capacity * 0.85 FROM gyms g WHERE g.id = a.gym_id)
      RETURNING a.id, a.gym_id
    `);

    for (const r of resolved) {
      if (broadcast) {
        broadcast({ type: 'ANOMALY_RESOLVED', anomaly_id: r.id, gym_id: r.gym_id, resolved_at: new Date().toISOString() });
      }
    }
  },

  // Anomaly Type 3: Revenue drop 30%+ vs same day last week
  async detectRevenueDrop(broadcast) {
    const { rows: gyms } = await pool.query(`
      SELECT g.id, g.name,
        COALESCE(today.total, 0) AS today_revenue,
        COALESCE(lastweek.total, 0) AS lastweek_revenue
      FROM gyms g
      LEFT JOIN (
        SELECT gym_id, SUM(amount) AS total
        FROM payments WHERE paid_at::DATE = CURRENT_DATE
        GROUP BY gym_id
      ) today ON today.gym_id = g.id
      LEFT JOIN (
        SELECT gym_id, SUM(amount) AS total
        FROM payments WHERE paid_at::DATE = CURRENT_DATE - INTERVAL '7 days'
        GROUP BY gym_id
      ) lastweek ON lastweek.gym_id = g.id
      WHERE g.status = 'active'
        AND COALESCE(lastweek.total, 0) > 0
        AND COALESCE(today.total, 0) <= COALESCE(lastweek.total, 0) * 0.7
    `);

    for (const gym of gyms) {
      const { rows: existing } = await pool.query(
        `SELECT id FROM anomalies WHERE gym_id = $1 AND type = 'revenue_drop' AND resolved = FALSE`,
        [gym.id]
      );
      if (existing.length > 0) continue;

      const dropPct = Math.round((1 - gym.today_revenue / gym.lastweek_revenue) * 100);
      const message = `${gym.name} revenue down ${dropPct}% today (₹${Number(gym.today_revenue).toLocaleString('en-IN')}) vs same day last week (₹${Number(gym.lastweek_revenue).toLocaleString('en-IN')})`;
      const { rows } = await pool.query(
        `INSERT INTO anomalies (gym_id, type, severity, message) VALUES ($1, 'revenue_drop', 'warning', $2) RETURNING *`,
        [gym.id, message]
      );
      if (broadcast && rows[0]) {
        broadcast({
          type: 'ANOMALY_DETECTED',
          anomaly_id: rows[0].id,
          gym_id: gym.id,
          gym_name: gym.name,
          anomaly_type: 'revenue_drop',
          severity: 'warning',
          message,
        });
      }
    }

    // Auto-resolve: revenue recovers within 20% of last week
    const { rows: resolved } = await pool.query(`
      UPDATE anomalies a SET resolved = TRUE, resolved_at = NOW()
      WHERE a.type = 'revenue_drop' AND a.resolved = FALSE
        AND (
          SELECT COALESCE(SUM(amount), 0) FROM payments WHERE gym_id = a.gym_id AND paid_at::DATE = CURRENT_DATE
        ) >= (
          SELECT COALESCE(SUM(amount), 0) * 0.8 FROM payments WHERE gym_id = a.gym_id AND paid_at::DATE = CURRENT_DATE - INTERVAL '7 days'
        )
      RETURNING a.id, a.gym_id
    `);

    for (const r of resolved) {
      if (broadcast) {
        broadcast({ type: 'ANOMALY_RESOLVED', anomaly_id: r.id, gym_id: r.gym_id, resolved_at: new Date().toISOString() });
      }
    }
  },

  // Get all anomalies (active + recently resolved)
  async getActive(gymId, severity) {
    let query = 'SELECT a.*, g.name AS gym_name FROM anomalies a JOIN gyms g ON g.id = a.gym_id WHERE 1=1';
    const params = [];
    if (gymId) { params.push(gymId); query += ` AND a.gym_id = $${params.length}`; }
    if (severity) { params.push(severity); query += ` AND a.severity = $${params.length}`; }
    query += ' ORDER BY a.detected_at DESC';
    const { rows } = await pool.query(query, params);
    return rows;
  },

  // Dismiss a warning-level anomaly
  async dismiss(anomalyId) {
    const { rows } = await pool.query('SELECT severity FROM anomalies WHERE id = $1', [anomalyId]);
    if (rows.length === 0) return { error: 'not_found' };
    if (rows[0].severity === 'critical') return { error: 'cannot_dismiss_critical' };

    const { rows: updated } = await pool.query(
      'UPDATE anomalies SET dismissed = TRUE, resolved = TRUE, resolved_at = NOW() WHERE id = $1 RETURNING *',
      [anomalyId]
    );
    return { anomaly: updated[0] };
  },

  // Get unresolved count
  async getActiveCount() {
    const { rows } = await pool.query('SELECT COUNT(*) AS count FROM anomalies WHERE resolved = FALSE');
    return parseInt(rows[0].count, 10);
  },
};

module.exports = anomalyService;
