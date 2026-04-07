const express = require('express');
const statsService = require('../services/statsService');

const router = express.Router();

// GET /api/analytics/cross-gym — Revenue comparison across all gyms
router.get('/cross-gym', async (req, res) => {
  try {
    const data = await statsService.getCrossGymRevenue();
    res.json(data);
  } catch (err) {
    console.error('GET /api/analytics/cross-gym error:', err);
    res.status(500).json({ error: 'Failed to fetch cross-gym analytics' });
  }
});

// GET /api/analytics/activity — Recent activity feed
router.get('/activity', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const data = await statsService.getRecentActivity(limit);
    res.json(data);
  } catch (err) {
    console.error('GET /api/analytics/activity error:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

module.exports = router;
