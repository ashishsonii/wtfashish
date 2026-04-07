const { WebSocketServer } = require('ws');

let wss = null;

function setupWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log(`WebSocket client connected. Total: ${wss.clients.size}`);

    // Send initial snapshot on connection
    const statsService = require('../services/statsService');
    const anomalyService = require('../services/anomalyService');

    (async () => {
      try {
        const [gyms, summary, anomalies] = await Promise.all([
          statsService.getAllGyms(),
          statsService.getAllGymsSummary(),
          anomalyService.getActive(),
        ]);

        ws.send(JSON.stringify({
          type: 'INITIAL_SNAPSHOT',
          gyms,
          summary,
          anomalies,
          timestamp: new Date().toISOString(),
        }));
      } catch (err) {
        console.error('Failed to send initial snapshot:', err.message);
      }
    })();

    ws.on('close', () => {
      console.log(`WebSocket client disconnected. Total: ${wss.clients.size}`);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });
  });

  return wss;
}

function broadcast(data) {
  if (!wss) return;
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

module.exports = { setupWebSocket, broadcast };
