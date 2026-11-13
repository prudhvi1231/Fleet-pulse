import { Request, Response, NextFunction } from 'express';
import { chaosStore } from '../state/chaos-store.js';

export function createChaosMiddleware(isPrimaryPort: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Port 4001 has no HTTP chaos
    if (!isPrimaryPort) {
      return next();
    }

    const path = req.path;
    // Exclude /auth/*, /chaos, /health from HTTP chaos
    if (path.startsWith('/auth') || path.startsWith('/chaos') || path.startsWith('/health')) {
      return next();
    }

    const chaos = chaosStore.getGlobal();

    // 1. http=429
    if (chaos.http429) {
      res.setHeader('Retry-After', '2');
      res.status(429).json({
        error: { code: 'rate_limited', message: 'Too many requests', details: [] }
      });
      return;
    }

    // 2. http=500:<pct>
    if (chaos.http500Pct && chaos.http500Pct > 0) {
      if (Math.random() * 100 < chaos.http500Pct) {
        res.status(500).json({
          error: { code: 'server_error', message: 'Internal server error (Chaos injected)', details: [] }
        });
        return;
      }
    }

    // 3. http=slow:<ms>
    if (chaos.httpSlowMs && chaos.httpSlowMs > 0) {
      setTimeout(() => {
        next();
      }, chaos.httpSlowMs);
      return;
    }

    next();
  };
}
