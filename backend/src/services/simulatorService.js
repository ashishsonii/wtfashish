const pool = require('../db/pool');

class SimulatorService {
  constructor() {
    this.running = false;
    this.speed = 1;
    this.intervalId = null;
    this.broadcast = null;
  }

  setBroadcast(fn) {
    this.broadcast = fn;
  }

  async start(speed = 1) {
    this.speed = speed;

    // Clear existing interval if any (supports speed change while running)
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.running = true;

    const baseInterval = 2000; // 2 seconds base
    const interval = Math.max(200, Math.floor(baseInterval / this.speed));

    this.intervalId = setInterval(() => this.generateEvent(), interval);
    return { status: 'running', speed: this.speed };
  }

  stop() {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    return { status: 'paused' };
  }

  async reset() {
    this.stop();
    // Close all open check-ins
    await pool.query("UPDATE checkins SET checked_out = NOW() WHERE checked_out IS NULL");
    return { status: 'reset' };
  }

  async generateEvent() {
    if (!this.running) return;

    try {
      const hour = new Date().getHours();
      const isCheckinHeavy = (hour >= 6 && hour <= 9) || (hour >= 17 && hour <= 20);
      const isMorning = hour >= 5 && hour <= 22;

      // Decide: checkin, checkout, or payment
      let eventType;
      if (!isMorning) {
        eventType = 'checkout'; // Night = only checkouts
      } else {
        // Get current open checkins count to balance
        const { rows: openRows } = await pool.query(
          'SELECT COUNT(*)::INTEGER AS count FROM checkins WHERE checked_out IS NULL'
        );
        const openCount = parseInt(openRows[0].count, 10);

        if (openCount < 50) {
          eventType = 'checkin';
        } else if (openCount > 400) {
          eventType = 'checkout';
        } else {
          const rand = Math.random();
          if (isCheckinHeavy) {
            eventType = rand < 0.65 ? 'checkin' : rand < 0.90 ? 'checkout' : 'payment';
          } else {
            eventType = rand < 0.35 ? 'checkin' : rand < 0.80 ? 'checkout' : 'payment';
          }
        }
      }

      if (eventType === 'checkin') {
        await this.simulateCheckin();
      } else if (eventType === 'checkout') {
        await this.simulateCheckout();
      } else {
        await this.simulatePayment();
      }
    } catch (err) {
      console.error('Simulator event error:', err.message);
    }
  }

  async simulateCheckin() {
    // Pick a random active member who is NOT currently checked in
    const { rows } = await pool.query(`
      SELECT m.id AS member_id, m.name, m.gym_id, g.name AS gym_name, g.capacity
      FROM members m
      JOIN gyms g ON g.id = m.gym_id
      WHERE m.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.member_id = m.id AND c.checked_out IS NULL)
        AND (SELECT COUNT(*) FROM checkins c2 WHERE c2.gym_id = g.id AND c2.checked_out IS NULL) < g.capacity * 1.2
      ORDER BY random() LIMIT 1
    `);
    if (rows.length === 0) return;

    const member = rows[0];
    const { rows: checkin } = await pool.query(
      'INSERT INTO checkins (member_id, gym_id, checked_in) VALUES ($1, $2, NOW()) RETURNING id, checked_in',
      [member.member_id, member.gym_id]
    );

    // Update last_checkin_at
    await pool.query('UPDATE members SET last_checkin_at = NOW() WHERE id = $1', [member.member_id]);

    // Get updated occupancy
    const { rows: occRows } = await pool.query(
      'SELECT COUNT(*)::INTEGER AS count FROM checkins WHERE gym_id = $1 AND checked_out IS NULL',
      [member.gym_id]
    );
    const occupancy = parseInt(occRows[0].count, 10);
    const capacityPct = Math.round((occupancy / member.capacity) * 100);

    if (this.broadcast) {
      this.broadcast({
        type: 'CHECKIN_EVENT',
        gym_id: member.gym_id,
        member_name: member.name,
        timestamp: checkin[0].checked_in,
        current_occupancy: occupancy,
        capacity_pct: capacityPct,
      });
    }
  }

  async simulateCheckout() {
    // Pick a random open checkin
    const { rows } = await pool.query(`
      SELECT c.id, c.member_id, c.gym_id, m.name, g.name AS gym_name, g.capacity
      FROM checkins c
      JOIN members m ON m.id = c.member_id
      JOIN gyms g ON g.id = c.gym_id
      WHERE c.checked_out IS NULL
      ORDER BY random() LIMIT 1
    `);
    if (rows.length === 0) return;

    const event = rows[0];
    await pool.query('UPDATE checkins SET checked_out = NOW() WHERE id = $1', [event.id]);

    // Get updated occupancy
    const { rows: occRows } = await pool.query(
      'SELECT COUNT(*)::INTEGER AS count FROM checkins WHERE gym_id = $1 AND checked_out IS NULL',
      [event.gym_id]
    );
    const occupancy = parseInt(occRows[0].count, 10);
    const capacityPct = Math.round((occupancy / event.capacity) * 100);

    if (this.broadcast) {
      this.broadcast({
        type: 'CHECKOUT_EVENT',
        gym_id: event.gym_id,
        member_name: event.name,
        timestamp: new Date().toISOString(),
        current_occupancy: occupancy,
        capacity_pct: capacityPct,
      });
    }
  }

  async simulatePayment() {
    // Pick a random active member and create a payment
    const { rows } = await pool.query(`
      SELECT m.id, m.name, m.gym_id, m.plan_type, g.name AS gym_name
      FROM members m
      JOIN gyms g ON g.id = m.gym_id
      WHERE m.status = 'active'
      ORDER BY random() LIMIT 1
    `);
    if (rows.length === 0) return;

    const member = rows[0];
    const amount = member.plan_type === 'monthly' ? 1499 : member.plan_type === 'quarterly' ? 3999 : 11999;

    await pool.query(
      'INSERT INTO payments (member_id, gym_id, amount, plan_type, payment_type, paid_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      [member.id, member.gym_id, amount, member.plan_type, 'renewal']
    );

    // Get today's total for this gym
    const { rows: revRows } = await pool.query(
      'SELECT COALESCE(SUM(amount), 0)::NUMERIC AS total FROM payments WHERE gym_id = $1 AND paid_at >= CURRENT_DATE',
      [member.gym_id]
    );

    if (this.broadcast) {
      this.broadcast({
        type: 'PAYMENT_EVENT',
        gym_id: member.gym_id,
        amount,
        plan_type: member.plan_type,
        member_name: member.name,
        today_total: parseFloat(revRows[0].total),
      });
    }
  }
}

module.exports = new SimulatorService();
