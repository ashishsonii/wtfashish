const anomalyService = require('../services/anomalyService');

let intervalId = null;

function startAnomalyDetector(broadcast) {
  console.log('[AnomalyDetector] Starting — running immediately on startup...');

  // Run immediately on startup (pre-warm)
  anomalyService.runDetection(broadcast)
    .then(() => console.log('[AnomalyDetector] Initial detection complete'))
    .catch(err => console.error('[AnomalyDetector] Initial detection error:', err.message));

  // Then run every 30 seconds
  intervalId = setInterval(async () => {
    try {
      await anomalyService.runDetection(broadcast);
    } catch (err) {
      console.error('[AnomalyDetector] Detection cycle error:', err.message);
    }
  }, 30000);
}

function stopAnomalyDetector() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { startAnomalyDetector, stopAnomalyDetector };
