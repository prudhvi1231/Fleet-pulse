import { Router, Request, Response } from 'express';

export const telemetryRouter = Router();

telemetryRouter.post('/', (req: Request, res: Response) => {
  // Accepts client error reports
  res.status(202).json({ accepted: true, count: req.body?.errors?.length || 0 });
});
