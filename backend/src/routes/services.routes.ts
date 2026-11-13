import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { dataStore } from '../state/data-store.js';

export const servicesRouter = Router();

servicesRouter.get('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.status(200).json(dataStore.services);
});
