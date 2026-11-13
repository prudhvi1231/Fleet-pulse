import { Router, Response } from 'express';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { dataStore } from '../state/data-store.js';
import { Rule, RuleCondition } from '../types.js';

export const rulesRouter = Router();

// GET /rules/check-name?name=&excludeId=
rulesRouter.get('/check-name', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const name = (req.query.name as string || '').trim().toLowerCase();
  const excludeId = req.query.excludeId as string;

  if (!name) {
    res.status(200).json({ available: false });
    return;
  }

  const conflict = dataStore.rules.find(r => r.name.toLowerCase() === name && r.id !== excludeId);
  res.status(200).json({ available: !conflict });
});

// GET /rules
rulesRouter.get('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.status(200).json(dataStore.rules);
});

// GET /rules/:id
rulesRouter.get('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const rule = dataStore.rules.find(r => r.id === req.params.id);
  if (!rule) {
    res.status(404).json({
      error: { code: 'not_found', message: `Rule ${req.params.id} not found`, details: [] }
    });
    return;
  }
  res.status(200).json(rule);
});

// POST /rules
rulesRouter.post('/', requireAuth, requireRole('operator'), (req: AuthenticatedRequest, res: Response) => {
  const idempotencyKey = req.headers['idempotency-key'] as string;
  if (idempotencyKey && dataStore.idempotencyMap.has(idempotencyKey)) {
    const cached = dataStore.idempotencyMap.get(idempotencyKey)!;
    res.status(cached.status).json(cached.body);
    return;
  }

  const body = req.body || {};
  const validationErrors: { field: string; message: string }[] = [];

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    validationErrors.push({ field: 'name', message: 'Rule name is required' });
  }

  if (body.name && dataStore.rules.some(r => r.name.toLowerCase() === body.name.trim().toLowerCase())) {
    res.status(409).json({
      error: { code: 'name_taken', message: 'Rule name already exists', details: [] }
    });
    return;
  }

  if (!Array.isArray(body.conditions) || body.conditions.length === 0) {
    validationErrors.push({ field: 'conditions', message: 'At least one condition is required' });
  } else {
    body.conditions.forEach((cond: RuleCondition, idx: number) => {
      if (!['p95', 'errRate', 'rps'].includes(cond.metric)) {
        validationErrors.push({ field: `conditions[${idx}].metric`, message: 'Metric must be p95, errRate, or rps' });
      }
      if (!['>', '>=', '<', '<='].includes(cond.operator)) {
        validationErrors.push({ field: `conditions[${idx}].operator`, message: 'Operator must be >, >=, <, or <=' });
      }
      if (typeof cond.threshold !== 'number' || isNaN(cond.threshold)) {
        validationErrors.push({ field: `conditions[${idx}].threshold`, message: 'Threshold must be a valid number' });
      }
      if (typeof cond.durationSec !== 'number' || isNaN(cond.durationSec) || cond.durationSec < 1) {
        validationErrors.push({ field: `conditions[${idx}].durationSec`, message: 'Duration must be at least 1 second' });
      }
    });
  }

  if (validationErrors.length > 0) {
    res.status(422).json({
      error: { code: 'validation', message: 'Validation failed', details: validationErrors }
    });
    return;
  }

  const now = Date.now();
  const newRule: Rule = {
    ...body,
    id: `r-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    name: body.name.trim(),
    conditions: body.conditions,
    createdAt: now,
    updatedAt: now
  };

  dataStore.rules.push(newRule);

  if (idempotencyKey) {
    dataStore.idempotencyMap.set(idempotencyKey, { status: 201, body: newRule });
  }

  res.status(201).json(newRule);
});

// PUT /rules/:id
rulesRouter.put('/:id', requireAuth, requireRole('operator'), (req: AuthenticatedRequest, res: Response) => {
  const ruleIdx = dataStore.rules.findIndex(r => r.id === req.params.id);
  if (ruleIdx === -1) {
    res.status(404).json({
      error: { code: 'not_found', message: `Rule ${req.params.id} not found`, details: [] }
    });
    return;
  }

  const body = req.body || {};
  const validationErrors: { field: string; message: string }[] = [];

  if (body.name && dataStore.rules.some(r => r.id !== req.params.id && r.name.toLowerCase() === body.name.trim().toLowerCase())) {
    res.status(409).json({
      error: { code: 'name_taken', message: 'Rule name already exists', details: [] }
    });
    return;
  }

  if (body.conditions) {
    if (!Array.isArray(body.conditions) || body.conditions.length === 0) {
      validationErrors.push({ field: 'conditions', message: 'At least one condition is required' });
    }
  }

  if (validationErrors.length > 0) {
    res.status(422).json({
      error: { code: 'validation', message: 'Validation failed', details: validationErrors }
    });
    return;
  }

  const existing = dataStore.rules[ruleIdx];
  const updated: Rule = {
    ...existing,
    ...body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now()
  };

  dataStore.rules[ruleIdx] = updated;
  res.status(200).json(updated);
});

// DELETE /rules/:id
rulesRouter.delete('/:id', requireAuth, requireRole('operator'), (req: AuthenticatedRequest, res: Response) => {
  const ruleIdx = dataStore.rules.findIndex(r => r.id === req.params.id);
  if (ruleIdx === -1) {
    res.status(404).json({
      error: { code: 'not_found', message: `Rule ${req.params.id} not found`, details: [] }
    });
    return;
  }

  dataStore.rules.splice(ruleIdx, 1);
  res.status(204).send();
});
