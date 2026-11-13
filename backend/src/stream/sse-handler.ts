import { Request, Response } from 'express';
import { dataStore } from '../state/data-store.js';
import { chaosStore } from '../state/chaos-store.js';
import { eventGenerator, GeneratedFrame } from './event-generator.js';

export function handleSseStream(req: Request, res: Response) {
  // 1. Auth check
  let token = req.query.access_token as string;
  const authHeader = req.headers['authorization'];
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  if (!token) {
    res.status(401).json({
      error: { code: 'token_invalid', message: 'Token required', details: [] }
    });
    return;
  }

  const authRes = dataStore.validateAccessToken(token);
  if (!authRes.valid && !authRes.expired) {
    res.status(401).json({
      error: { code: 'token_invalid', message: 'Invalid access token', details: [] }
    });
    return;
  }

  // 2. Parse chaos overrides
  const chaos = chaosStore.parseQuerySwitches(req.query);

  if (chaos.sse === 'down') {
    res.status(503).json({
      error: { code: 'unavailable', message: 'SSE transport down (Chaos)', details: [] }
    });
    return;
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.flushHeaders();

  // If kill=<s>: close periodically
  let killTimer: NodeJS.Timeout | null = null;
  if (chaos.killIntervalSec && chaos.killIntervalSec > 0) {
    killTimer = setInterval(() => {
      res.end();
    }, chaos.killIntervalSec * 1000);
  }

  const onFrame = (frame: GeneratedFrame) => {
    try {
      if (frame.type === 'metric') {
        const idHeader = frame.offset ? `id: ${frame.offset}\n` : '';
        res.write(`event: metric\n${idHeader}data: ${frame.rawText}\n\n`);
      } else if (frame.type === 'ping') {
        res.write(`event: ping\ndata: ${frame.rawText}\n\n`);
      } else if (frame.type === 'garbage') {
        res.write(`event: metric\ndata: ${frame.rawText}\n\n`);
      }
    } catch {
      // client connection closed
    }
  };

  eventGenerator.on('frame', onFrame);

  req.on('close', () => {
    eventGenerator.off('frame', onFrame);
    if (killTimer) clearInterval(killTimer);
  });
}
