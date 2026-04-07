const express = require('express');
const simulatorService = require('../services/simulatorService');

const router = express.Router();

// POST /api/simulator/start
router.post('/start', async (req, res) => {
  try {
    const speed = parseInt(req.body?.speed, 10) || 1;
    if (![1, 5, 10].includes(speed)) {
      return res.status(400).json({ error: 'Speed must be 1, 5, or 10' });
    }
    const result = await simulatorService.start(speed);
    res.json(result);
  } catch (err) {
    console.error('POST /api/simulator/start error:', err);
    res.status(500).json({ error: 'Failed to start simulator' });
  }
});

// POST /api/simulator/stop
router.post('/stop', (req, res) => {
  const result = simulatorService.stop();
  res.json(result);
});

// POST /api/simulator/reset
router.post('/reset', async (req, res) => {
  try {
    const result = await simulatorService.reset();
    res.json(result);
  } catch (err) {
    console.error('POST /api/simulator/reset error:', err);
    res.status(500).json({ error: 'Failed to reset simulator' });
  }
});

module.exports = router;
