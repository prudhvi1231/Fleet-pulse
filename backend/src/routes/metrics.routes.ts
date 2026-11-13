import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { dataStore } from '../state/data-store.js';

export const metricsRouter = Router();

metricsRouter.get('/snapshot', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const metrics = Array.from(dataStore.latestMetrics.values());
  res.status(200).json({
    offset: dataStore.globalOffset,
    ts: Date.now(),
    metrics
  });
});

metricsRouter.get('/history', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const serviceId = req.query.serviceId as string;
  if (!serviceId) {
    res.status(400).json({
      error: { code: 'bad_request', message: 'serviceId query parameter is required', details: [] }
    });
    return;
  }

  const exists = dataStore.services.some(s => s.id === serviceId);
  if (!exists) {
    res.status(404).json({
      error: { code: 'not_found', message: `Service ${serviceId} not found`, details: [] }
    });
    return;
  }

  const minutes = parseInt(String(req.query.minutes || '15'), 10);
  const points = dataStore.getHistoryForService(serviceId, isNaN(minutes) ? 15 : minutes);

  res.status(200).json({
    serviceId,
    points
  });
});

metricsRouter.get('/replay', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const sinceStr = req.query.since as string;
  if (sinceStr === undefined || sinceStr === '') {
    res.status(400).json({
      error: { code: 'bad_request', message: 'since query parameter is required', details: [] }
    });
    return;
  }

  const since = parseInt(sinceStr, 10);
  if (isNaN(since)) {
    res.status(400).json({
      error: { code: 'bad_request', message: 'Invalid since offset', details: [] }
    });
    return;
  }

  const replay = dataStore.getReplay(since);
  if (replay === null) {
    res.status(410).json({
      error: { code: 'replay_too_old', message: 'Replay window expired; reload full snapshot', details: [] }
    });
    return;
  }

  res.status(200).json(replay);
});
