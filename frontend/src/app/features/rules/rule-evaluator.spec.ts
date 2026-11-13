import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { RuleEvaluatorService } from './rule-evaluator.service.js';
import { StreamPipelineService } from '../../core/stream/stream-pipeline.service.js';
import { Rule, MetricEvent } from '../../core/models/service.model.js';

describe('RuleEvaluatorService (In-Browser Live Evaluation & Deduplication)', () => {
  let evaluator: RuleEvaluatorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RuleEvaluatorService,
        StreamPipelineService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    evaluator = TestBed.inject(RuleEvaluatorService);
  });

  afterEach(() => {
    evaluator.destroy();
  });

  it('should fire an incident when metric exceeds threshold for durationSec', () => {
    const testRule: Rule = {
      id: 'r-test',
      name: 'High Latency Alarm',
      conditions: [
        { metric: 'p95', operator: '>', threshold: 500, durationSec: 1 } // 1 second duration
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    evaluator.activeRules.set([testRule]);

    const initialEvent: MetricEvent = {
      type: 'metric',
      offset: 1,
      serviceId: 'svc-0042',
      seq: 1,
      ts: Date.now() - 2000, // 2 seconds ago
      p95: 650, // Breached
      errRate: 0,
      rps: 1000,
      status: 'degraded'
    };

    // First breach recorded
    (evaluator as any).evaluateEvent(initialEvent);

    // After durationSec has elapsed, next breach event triggers incident
    const followUpEvent: MetricEvent = {
      ...initialEvent,
      offset: 2,
      seq: 2,
      ts: Date.now(),
      p95: 700
    };

    (evaluator as any).evaluateEvent(followUpEvent);

    const incidents = evaluator.incidents();
    expect(incidents.length).toBe(1);
    expect(incidents[0].serviceId).toBe('svc-0042');
    expect(incidents[0].ruleName).toBe('High Latency Alarm');
    expect(evaluator.toastNotification()).toContain('High Latency Alarm');
  });

  it('should NOT fire the same incident twice while it is still active', () => {
    const testRule: Rule = {
      id: 'r-test',
      name: 'Error Spike',
      conditions: [
        { metric: 'errRate', operator: '>=', threshold: 10, durationSec: 1 }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    evaluator.activeRules.set([testRule]);

    const breachEvent: MetricEvent = {
      type: 'metric',
      offset: 10,
      serviceId: 'svc-0099',
      seq: 1,
      ts: Date.now() - 2000,
      p95: 100,
      errRate: 15.0, // Breached
      rps: 1000,
      status: 'down'
    };

    // Evaluate initial breach
    (evaluator as any).evaluateEvent(breachEvent);
    // Trigger breach incident after duration elapsed
    (evaluator as any).evaluateEvent({ ...breachEvent, offset: 11, seq: 2, ts: Date.now() });

    expect(evaluator.incidents().length).toBe(1);

    // Stream delivers multiple subsequent breach events while active
    (evaluator as any).evaluateEvent({ ...breachEvent, offset: 12, seq: 3, ts: Date.now() + 1000, errRate: 18.0 });
    (evaluator as any).evaluateEvent({ ...breachEvent, offset: 13, seq: 4, ts: Date.now() + 2000, errRate: 20.0 });

    // D8: The same incident must not fire twice!
    expect(evaluator.incidents().length).toBe(1);
  });
});
