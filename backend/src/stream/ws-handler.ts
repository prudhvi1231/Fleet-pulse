import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { dataStore } from '../state/data-store.js';
import { chaosStore } from '../state/chaos-store.js';
import { eventGenerator, GeneratedFrame } from './event-generator.js';

export function setupWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const parsedUrl = new URL(req.url || '', 'http://localhost:4000');
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    // 1. Auth check on connection
    let token = query.access_token;
    const authHeader = req.headers['authorization'];
    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token) {
      ws.close(4401, 'Unauthorized');
      return;
    }

    const authRes = dataStore.validateAccessToken(token);
    // Notice: brief says: "An invalid token closes the WebSocket with code 4401"
    if (!authRes.valid && !authRes.expired) {
      ws.close(4401, 'Unauthorized');
      return;
    }

    // 2. Parse connection-level chaos overrides
    const chaos = chaosStore.parseQuerySwitches(query);

    // If ws=down: immediately terminate
    if (chaos.ws === 'down') {
      ws.close(1011, 'Service Unavailable (Chaos: ws=down)');
      return;
    }

    // If kill=<s>: close periodically
    let killTimer: NodeJS.Timeout | null = null;
    if (chaos.killIntervalSec && chaos.killIntervalSec > 0) {
      killTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1006, `Abrupt close (Chaos: kill=${chaos.killIntervalSec})`);
        }
      }, chaos.killIntervalSec * 1000);
    }

    // If ws=silent: socket stays open, but receives nothing!
    const isSilent = chaos.ws === 'silent';

    const onFrame = (frame: GeneratedFrame) => {
      if (isSilent) return;
      if (ws.readyState !== WebSocket.OPEN) return;

      // Send raw text (handles garbage JSON as well)
      ws.send(frame.rawText);
    };

    eventGenerator.on('frame', onFrame);

    ws.on('close', () => {
      eventGenerator.off('frame', onFrame);
      if (killTimer) clearInterval(killTimer);
    });

    ws.on('error', () => {
      eventGenerator.off('frame', onFrame);
      if (killTimer) clearInterval(killTimer);
    });
  });
}
