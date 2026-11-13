import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';

import { authRouter } from './routes/auth.routes.js';
import { servicesRouter } from './routes/services.routes.js';
import { metricsRouter } from './routes/metrics.routes.js';
import { rulesRouter } from './routes/rules.routes.js';
import { chaosRouter } from './routes/chaos.routes.js';
import { telemetryRouter } from './routes/telemetry.routes.js';
import { assistantRouter } from './routes/assistant.routes.js';

import { handleSseStream } from './stream/sse-handler.js';
import { setupWebSocket } from './stream/ws-handler.js';
import { eventGenerator } from './stream/event-generator.js';
import { createChaosMiddleware } from './middleware/chaos.middleware.js';

function createPulseApp(isPrimary: boolean) {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  // Chaos middleware (applies only on primary port 4000)
  app.use(createChaosMiddleware(isPrimary));

  // Health
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', port: isPrimary ? 4000 : 4001 });
  });

  // Streaming endpoints (primary only)
  if (isPrimary) {
    app.get('/stream/sse', handleSseStream);
    app.use('/assistant', assistantRouter);
  }

  // REST API routes
  app.use('/auth', authRouter);
  app.use('/services', servicesRouter);
  app.use('/metrics', metricsRouter);
  app.use('/rules', rulesRouter);
  app.use('/chaos', chaosRouter);
  app.use('/telemetry', telemetryRouter);

  // Catch-all 404
  app.use((req, res) => {
    res.status(404).json({
      error: { code: 'not_found', message: `Route ${req.method} ${req.path} not found`, details: [] }
    });
  });

  return app;
}

// 1. Primary Server (Port 4000)
const primaryApp = createPulseApp(true);
const primaryServer = http.createServer(primaryApp);
const wss = new WebSocketServer({ server: primaryServer, path: '/stream' });
setupWebSocket(wss);

const PORT_PRIMARY = process.env.PORT || 4000;
primaryServer.listen(PORT_PRIMARY, () => {
  console.log(`[FleetPulse] Mock Backend running on http://localhost:${PORT_PRIMARY} (WebSocket on ws://localhost:${PORT_PRIMARY}/stream)`);
});

// 2. Secondary Server (Port 4001) for circuit breaker failover
const secondaryApp = createPulseApp(false);
const secondaryServer = http.createServer(secondaryApp);
const PORT_SECONDARY = process.env.SECONDARY_PORT || 4001;

secondaryServer.listen(PORT_SECONDARY, () => {
  console.log(`[FleetPulse] Secondary Failover Backend running on http://localhost:${PORT_SECONDARY}`);
});

// Start event streaming generator
eventGenerator.start();
console.log('[FleetPulse] Live event generator started.');
