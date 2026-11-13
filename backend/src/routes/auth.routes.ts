import { Router, Request, Response } from 'express';
import { dataStore } from '../state/data-store.js';

export const authRouter = Router();

authRouter.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    res.status(400).json({
      error: { code: 'bad_request', message: 'Email and password required', details: [] }
    });
    return;
  }

  const user = dataStore.users.get(email);
  if (!user || user.passwordHash !== password) {
    res.status(401).json({
      error: { code: 'invalid_credentials', message: 'Invalid credentials', details: [] }
    });
    return;
  }

  const tokens = dataStore.createTokens(user);

  res.status(200).json({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    user: {
      id: user.id,
      email: user.email,
      role: user.role
    }
  });
});

authRouter.post('/refresh', (req: Request, res: Response) => {
  const { refreshToken } = req.body || {};

  if (!refreshToken) {
    res.status(401).json({
      error: { code: 'refresh_invalid', message: 'Refresh token required', details: [] }
    });
    return;
  }

  const result = dataStore.rotateRefreshToken(refreshToken);
  if (!result) {
    res.status(401).json({
      error: { code: 'refresh_invalid', message: 'Invalid or expired refresh token', details: [] }
    });
    return;
  }

  res.status(200).json(result);
});
