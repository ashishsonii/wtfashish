const express = require('express');
const anomalyService = require('../services/anomalyService');

const router = express.Router();
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// GET /api/anomalies — List active anomalies
router.get('/', async (req, res) => {
  try {
    const { gym_id, severity } = req.query;
    if (severity && !['warning', 'critical'].includes(severity)) {
      return res.status(400).json({ error: 'Invalid severity. Must be warning or critical' });
    }
    const anomalies = await anomalyService.getActive(gym_id, severity);
    res.json(anomalies);
  } catch (err) {
    console.error('GET /api/anomalies error:', err);
    res.status(500).json({ error: 'Failed to fetch anomalies' });
  }
});

// GET /api/anomalies/count — Unresolved anomaly count
router.get('/count', async (req, res) => {
  try {
    const count = await anomalyService.getActiveCount();
    res.json({ count });
  } catch (err) {
    console.error('GET /api/anomalies/count error:', err);
    res.status(500).json({ error: 'Failed to fetch count' });
  }
});

// PATCH /api/anomalies/:id/dismiss — Dismiss warning anomaly
router.patch('/:id/dismiss', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid anomaly ID format' });

    const result = await anomalyService.dismiss(id);
    if (result.error === 'not_found') return res.status(404).json({ error: 'Anomaly not found' });
    if (result.error === 'cannot_dismiss_critical') return res.status(403).json({ error: 'Critical anomalies cannot be dismissed' });
    res.json(result.anomaly);
  } catch (err) {
    console.error('PATCH /api/anomalies/:id/dismiss error:', err);
    res.status(500).json({ error: 'Failed to dismiss anomaly' });
  }
});

module.exports = router;
