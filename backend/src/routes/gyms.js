const express = require('express');
const statsService = require('../services/statsService');

const router = express.Router();
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/gyms — List all gyms with occupancy & revenue
router.get('/', async (req, res) => {
  try {
    const gyms = await statsService.getAllGyms();
    res.json(gyms);
  } catch (err) {
    console.error('GET /api/gyms error:', err);
    res.status(500).json({ error: 'Failed to fetch gyms' });
  }
});

// GET /api/gyms/summary — Aggregate totals across all gyms
router.get('/summary', async (req, res) => {
  try {
    const summary = await statsService.getAllGymsSummary();
    res.json(summary);
  } catch (err) {
    console.error('GET /api/gyms/summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// GET /api/gyms/:id/live — Live snapshot for a single gym
router.get('/:id/live', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid gym ID format' });

    const data = await statsService.getGymLive(id);
    if (!data) return res.status(404).json({ error: 'Gym not found' });
    res.json(data);
  } catch (err) {
    console.error('GET /api/gyms/:id/live error:', err);
    res.status(500).json({ error: 'Failed to fetch gym live data' });
  }
});

// GET /api/gyms/:id/analytics — Analytics for a single gym
router.get('/:id/analytics', async (req, res) => {
  try {
    const { id } = req.params;
    const dateRange = req.query.dateRange || '30d';
    if (!['7d', '30d', '90d'].includes(dateRange)) {
      return res.status(400).json({ error: 'Invalid dateRange. Must be 7d, 30d, or 90d' });
    }
    if (!id || !uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid gym ID format' });

    const data = await statsService.getGymAnalytics(id, dateRange);
    res.json(data);
  } catch (err) {
    console.error('GET /api/gyms/:id/analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = router;
