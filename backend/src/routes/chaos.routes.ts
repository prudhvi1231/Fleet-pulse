import { Router, Request, Response } from 'express';
import { chaosStore } from '../state/chaos-store.js';

export const chaosRouter = Router();

chaosRouter.get('/', (req: Request, res: Response) => {
  res.status(200).json(chaosStore.getGlobal());
});

chaosRouter.post('/', (req: Request, res: Response) => {
  const switches = req.body || {};
  const updated = chaosStore.setGlobal(switches);
  res.status(200).json(updated);
});

chaosRouter.delete('/', (req: Request, res: Response) => {
  const reset = chaosStore.resetGlobal();
  res.status(200).json(reset);
});
