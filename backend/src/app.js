const express = require('express');
const cors = require('cors');
const http = require('http');
const { setupWebSocket, broadcast } = require('./websocket/server');
const { startAnomalyDetector } = require('./jobs/anomalyDetector');
const simulatorService = require('./services/simulatorService');
const statsService = require('./services/statsService');
const pool = require('./db/pool');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/gyms', require('./routes/gyms'));
app.use('/api/anomalies', require('./routes/anomalies'));
app.use('/api/simulator', require('./routes/simulator'));
app.use('/api/analytics', require('./routes/analytics'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create HTTP server and attach WebSocket
const server = http.createServer(app);
setupWebSocket(server);

// Wire simulator broadcast
simulatorService.setBroadcast(broadcast);

// Startup sequence
async function startup() {
  try {
    // Verify database connection
    const { rows } = await pool.query('SELECT COUNT(*) AS count FROM gyms');
    console.log(`[Startup] Database connected. ${rows[0].count} gyms found.`);

    // Start anomaly detector immediately
    startAnomalyDetector(broadcast);

    // Refresh materialized view
    try {
      await statsService.refreshMaterializedView();
      console.log('[Startup] Materialized view refreshed.');
    } catch (err) {
      console.log('[Startup] Materialized view refresh skipped (may need initial data):', err.message);
    }

    // Schedule materialized view refresh every 15 minutes
    setInterval(async () => {
      try {
        await statsService.refreshMaterializedView();
      } catch (err) {
        console.error('[MatView] Refresh error:', err.message);
      }
    }, 15 * 60 * 1000);

    // Start server
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🏋️ WTF LivePulse Backend running on port ${PORT}`);
      console.log(`   REST API: http://localhost:${PORT}/api`);
      console.log(`   WebSocket: ws://localhost:${PORT}/ws\n`);
    });
  } catch (err) {
    console.error('[Startup] Failed:', err.message);
    // Retry after 3 seconds
    console.log('[Startup] Retrying in 3 seconds...');
    setTimeout(startup, 3000);
  }
}

startup();

module.exports = app;
