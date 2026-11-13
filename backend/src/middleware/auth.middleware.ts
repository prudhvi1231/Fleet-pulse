import { Request, Response, NextFunction } from 'express';
import { dataStore } from '../state/data-store.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: 'operator' | 'viewer';
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: { code: 'token_invalid', message: 'Missing Authorization header', details: [] }
    });
    return;
  }

  const token = authHeader.substring(7);
  const result = dataStore.validateAccessToken(token);

  if (result.expired) {
    res.status(401).json({
      error: { code: 'token_expired', message: 'Access token expired', details: [] }
    });
    return;
  }

  if (!result.valid || !result.user) {
    res.status(401).json({
      error: { code: 'token_invalid', message: 'Invalid access token', details: [] }
    });
    return;
  }

  req.user = result.user;
  next();
}

export function requireRole(role: 'operator' | 'viewer') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        error: { code: 'token_invalid', message: 'Authentication required', details: [] }
      });
      return;
    }

    if (role === 'operator' && req.user.role !== 'operator') {
      res.status(403).json({
        error: { code: 'forbidden', message: 'Operator role required', details: [] }
      });
      return;
    }

    next();
  };
}
