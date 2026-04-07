const pool = require('../db/pool');

const statsService = {
  // Q1: Live Occupancy — Single Gym (target: <0.5ms)
  async getLiveOccupancy(gymId) {
    const { rows } = await pool.query(
      'SELECT COUNT(*) AS count FROM checkins WHERE gym_id = $1 AND checked_out IS NULL',
      [gymId]
    );
    return parseInt(rows[0].count, 10);
  },

  // Q2: Today's Revenue — Single Gym (target: <0.8ms)
  async getTodayRevenue(gymId) {
    const { rows } = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE gym_id = $1 AND paid_at >= CURRENT_DATE',
      [gymId]
    );
    return parseFloat(rows[0].total);
  },

  // Get all gyms with current occupancy and today revenue
  async getAllGyms() {
    const { rows } = await pool.query(`
      SELECT g.id, g.name, g.city, g.capacity, g.status, g.opens_at, g.closes_at,
        COALESCE(occ.count, 0)::INTEGER AS current_occupancy,
        COALESCE(rev.total, 0)::NUMERIC AS today_revenue
      FROM gyms g
      LEFT JOIN (
        SELECT gym_id, COUNT(*) AS count FROM checkins WHERE checked_out IS NULL GROUP BY gym_id
      ) occ ON occ.gym_id = g.id
      LEFT JOIN (
        SELECT gym_id, SUM(amount) AS total FROM payments WHERE paid_at >= CURRENT_DATE GROUP BY gym_id
      ) rev ON rev.gym_id = g.id
      ORDER BY g.capacity DESC
    `);
    return rows.map(r => ({
      ...r,
      current_occupancy: parseInt(r.current_occupancy, 10),
      today_revenue: parseFloat(r.today_revenue),
    }));
  },

  // Live snapshot for a single gym
  async getGymLive(gymId) {
    const [occupancyCount, revenue, events, anomalies, gymInfo] = await Promise.all([
      statsService.getLiveOccupancy(gymId),
      statsService.getTodayRevenue(gymId),
      pool.query(`
        SELECT c.id, 'checkin' AS event_type, m.name AS member_name, g.name AS gym_name, c.checked_in AS timestamp
        FROM checkins c
        JOIN members m ON m.id = c.member_id
        JOIN gyms g ON g.id = c.gym_id
        WHERE c.gym_id = $1
        ORDER BY c.checked_in DESC LIMIT 20
      `, [gymId]),
      pool.query(`
        SELECT id, type, severity, message, detected_at, resolved, dismissed
        FROM anomalies WHERE gym_id = $1 AND resolved = FALSE
        ORDER BY detected_at DESC
      `, [gymId]),
      pool.query('SELECT id, name, city, capacity, status, opens_at, closes_at FROM gyms WHERE id = $1', [gymId]),
    ]);

    const gym = gymInfo.rows[0];
    if (!gym) return null;

    const percentage = gym.capacity > 0 ? Math.round((occupancyCount / gym.capacity) * 100) : 0;
    const color = percentage > 85 ? 'red' : percentage >= 60 ? 'yellow' : 'green';

    return {
      gym,
      occupancy: { count: occupancyCount, percentage, color },
      current_occupancy: occupancyCount,
      capacity_pct: percentage,
      today_revenue: revenue,
      recent_events: events.rows,
      active_anomalies: anomalies.rows,
    };
  },

  // Q4: Peak Hour Heatmap from materialized view (target: <0.3ms)
  async getHeatmap(gymId) {
    const { rows } = await pool.query(
      'SELECT day_of_week, hour_of_day, checkin_count FROM gym_hourly_stats WHERE gym_id = $1',
      [gymId]
    );
    return rows;
  },

  // Revenue by plan type for selected gym
  async getRevenueByPlan(gymId, days = 30) {
    const { rows } = await pool.query(`
      SELECT plan_type, SUM(amount)::NUMERIC AS total, COUNT(*) AS count
      FROM payments
      WHERE gym_id = $1 AND paid_at >= NOW() - ($2 || ' days')::INTERVAL
      GROUP BY plan_type
      ORDER BY total DESC
    `, [gymId, days]);
    return rows.map(r => ({ ...r, total: parseFloat(r.total) }));
  },

  // Q3: Churn Risk Members (target: <1ms)
  async getChurnRisk(gymId) {
    const { rows } = await pool.query(`
      SELECT id, name, last_checkin_at,
        EXTRACT(EPOCH FROM (NOW() - last_checkin_at))::INTEGER / 86400 AS days_since_checkin,
        CASE
          WHEN last_checkin_at < NOW() - INTERVAL '60 days' THEN 'Critical'
          WHEN last_checkin_at < NOW() - INTERVAL '45 days' THEN 'High'
          ELSE 'Normal'
        END AS risk_level
      FROM members
      WHERE status = 'active'
        AND last_checkin_at < NOW() - INTERVAL '45 days'
        AND ($1::UUID IS NULL OR gym_id = $1)
      ORDER BY last_checkin_at ASC
    `, [gymId || null]);
    return rows;
  },

  // New vs Renewal ratio
  async getNewVsRenewal(gymId, days = 30) {
    const { rows } = await pool.query(`
      SELECT payment_type, COUNT(*) AS count, SUM(amount)::NUMERIC AS total
      FROM payments
      WHERE gym_id = $1 AND paid_at >= NOW() - ($2 || ' days')::INTERVAL
      GROUP BY payment_type
    `, [gymId, days]);
    return rows.map(r => ({ ...r, total: parseFloat(r.total) }));
  },

  // Q5: Cross-Gym Revenue Comparison (target: <2ms)
  async getCrossGymRevenue() {
    const { rows } = await pool.query(`
      SELECT g.id AS gym_id, g.name AS gym_name, COALESCE(SUM(p.amount), 0)::NUMERIC AS total_revenue,
        RANK() OVER (ORDER BY COALESCE(SUM(p.amount), 0) DESC)::INTEGER AS rank
      FROM gyms g
      LEFT JOIN payments p ON p.gym_id = g.id AND p.paid_at >= NOW() - INTERVAL '30 days'
      GROUP BY g.id, g.name
      ORDER BY total_revenue DESC
    `);
    return rows.map(r => ({ ...r, total_revenue: parseFloat(r.total_revenue) }));
  },

  // Get all analytics for a gym
  async getGymAnalytics(gymId, dateRange = '30d') {
    const days = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30;
    const [heatmap, revenueByPlan, churnRisk, newVsRenewal] = await Promise.all([
      statsService.getHeatmap(gymId),
      statsService.getRevenueByPlan(gymId, days),
      statsService.getChurnRisk(gymId),
      statsService.getNewVsRenewal(gymId, days),
    ]);

    // Build new_vs_renewal_ratio shape per spec
    const newCount = newVsRenewal.find(r => r.payment_type === 'new')?.count || 0;
    const renewalCount = newVsRenewal.find(r => r.payment_type === 'renewal')?.count || 0;
    const totalNR = (parseInt(newCount) + parseInt(renewalCount)) || 1;

    return {
      peak_hours_heatmap: heatmap,
      revenue_by_plan: revenueByPlan,
      churn_risk_members: churnRisk,
      new_vs_renewal_ratio: {
        new_count: parseInt(newCount),
        renewal_count: parseInt(renewalCount),
        new_pct: Math.round((parseInt(newCount) / totalNR) * 100),
        renewal_pct: Math.round((parseInt(renewalCount) / totalNR) * 100),
      },
      // Keep backwards-compatible keys for frontend
      heatmap,
      churn_risk: churnRisk,
      new_vs_renewal: newVsRenewal,
    };
  },

  // Get recent activity feed across all gyms
  async getRecentActivity(limit = 20, gymId = null) {
    const gymFilter = gymId ? 'AND c.gym_id = $2' : '';
    const paymentGymFilter = gymId ? 'AND p.gym_id = $2' : '';
    const params = gymId ? [limit, gymId] : [limit];

    const { rows } = await pool.query(`
      (
        SELECT 'checkin' AS event_type, m.name AS member_name, g.name AS gym_name, c.checked_in AS timestamp, g.id AS gym_id
        FROM checkins c JOIN members m ON m.id = c.member_id JOIN gyms g ON g.id = c.gym_id
        WHERE 1=1 ${gymFilter}
        ORDER BY c.checked_in DESC LIMIT $1
      )
      UNION ALL
      (
        SELECT 'checkout' AS event_type, m.name AS member_name, g.name AS gym_name, c.checked_out AS timestamp, g.id AS gym_id
        FROM checkins c JOIN members m ON m.id = c.member_id JOIN gyms g ON g.id = c.gym_id
        WHERE c.checked_out IS NOT NULL ${gymFilter}
        ORDER BY c.checked_out DESC LIMIT $1
      )
      UNION ALL
      (
        SELECT 'payment' AS event_type, m.name AS member_name, g.name AS gym_name, p.paid_at AS timestamp, g.id AS gym_id
        FROM payments p JOIN members m ON m.id = p.member_id JOIN gyms g ON g.id = p.gym_id
        WHERE 1=1 ${paymentGymFilter}
        ORDER BY p.paid_at DESC LIMIT $1
      )
      ORDER BY timestamp DESC LIMIT $1
    `, params);
    return rows;
  },

  // Refresh materialized view
  async refreshMaterializedView() {
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY gym_hourly_stats');
  },

  // Total summary across all gyms
  async getAllGymsSummary() {
    const [checkedIn, revenue, anomalyCount] = await Promise.all([
      pool.query('SELECT COALESCE(COUNT(*), 0)::INTEGER AS total FROM checkins WHERE checked_out IS NULL'),
      pool.query('SELECT COALESCE(SUM(amount), 0)::NUMERIC AS total FROM payments WHERE paid_at >= CURRENT_DATE'),
      pool.query('SELECT COUNT(*)::INTEGER AS total FROM anomalies WHERE resolved = FALSE'),
    ]);
    return {
      total_checked_in: parseInt(checkedIn.rows[0].total, 10),
      total_revenue: parseFloat(revenue.rows[0].total),
      active_anomalies: parseInt(anomalyCount.rows[0].total, 10),
    };
  },
};

module.exports = statsService;
