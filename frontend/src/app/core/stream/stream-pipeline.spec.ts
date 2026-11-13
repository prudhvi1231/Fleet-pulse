import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { StreamPipelineService } from './stream-pipeline.service.js';
import { TransportCoordinatorService } from './transport-coordinator.service.js';
import { MetricEvent } from '../models/service.model.js';
import { APP_CONFIG } from '../config/app-config.js';

describe('StreamPipelineService (Data Integrity & Sequence Handling)', () => {
  let service: StreamPipelineService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        StreamPipelineService,
        TransportCoordinatorService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    service = TestBed.inject(StreamPipelineService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    service.destroy();
  });

  it('should safely intercept malformed JSON without crashing the stream', () => {
    const initialMalformed = service.malformedEventCount();
    // Simulate corrupt frame arrival
    (service as any).processRawFrame('{"corrupt": invalid_json');
    expect(service.malformedEventCount()).toBe(initialMalformed + 1);
  });

  it('should safely intercept frames missing required fields without crashing', () => {
    const initialMalformed = service.malformedEventCount();
    // Missing required p95, errRate, rps
    (service as any).processRawFrame(JSON.stringify({ type: 'metric', offset: 100 }));
    expect(service.malformedEventCount()).toBe(initialMalformed + 1);
  });

  it('should drop duplicate events with identical offsets', () => {
    const event: MetricEvent = {
      type: 'metric',
      offset: 5000,
      serviceId: 'svc-0001',
      seq: 101,
      ts: Date.now(),
      p95: 120,
      errRate: 0.5,
      rps: 1200,
      status: 'healthy'
    };

    const initialDupes = service.duplicateEventCount();
    (service as any).processRawFrame(JSON.stringify(event));
    // Send identical event again
    (service as any).processRawFrame(JSON.stringify(event));

    expect(service.duplicateEventCount()).toBe(initialDupes + 1);
  });

  it('should detect offset gaps and trigger /metrics/replay?since=<offset>', () => {
    // Event arrives with offset 105 (gap when last offset was 100)
    const eventGap: MetricEvent = {
      type: 'metric',
      offset: 105,
      serviceId: 'svc-0001',
      seq: 5,
      ts: Date.now(),
      p95: 110,
      errRate: 0,
      rps: 1000,
      status: 'healthy'
    };

    (service as any).lastGlobalOffset = 100;
    (service as any).processRawFrame(JSON.stringify(eventGap));

    expect(service.gapReplayCount()).toBe(1);

    const req = httpTesting.expectOne(`${APP_CONFIG.apiBaseUrl}/metrics/replay?since=100`);
    expect(req.request.method).toBe('GET');
    req.flush({ events: [], offset: 105 });
  });
});
