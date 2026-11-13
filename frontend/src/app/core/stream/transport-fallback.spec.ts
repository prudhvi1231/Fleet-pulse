import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { TransportCoordinatorService } from './transport-coordinator.service.js';
import { AuthService } from '../auth/auth.service.js';

describe('TransportCoordinatorService (R1 Fallback State Machine)', () => {
  let coordinator: TransportCoordinatorService;
  let authService: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TransportCoordinatorService,
        AuthService,
        { provide: Router, useValue: { navigate: vi.fn(), url: '/' } },
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    coordinator = TestBed.inject(TransportCoordinatorService);
    authService = TestBed.inject(AuthService);

    // Mock active token
    (authService as any).accessTokenSignal.set('mock-valid-token');
  });

  afterEach(() => {
    coordinator.stop();
  });

  it('should start with primary transport WebSocket', () => {
    expect(coordinator.currentTransportType()).toBe('websocket');
  });

  it('should fallback to SSE after 3 consecutive WebSocket failures', () => {
    expect(coordinator.currentTransportType()).toBe('websocket');

    // Simulate 3 WS failures
    (coordinator as any).handleTransportFailure();
    (coordinator as any).handleTransportFailure();
    (coordinator as any).handleTransportFailure();

    expect(coordinator.currentTransportType()).toBe('sse');
  });

  it('should fallback to Polling after 3 consecutive SSE failures', () => {
    // Put coordinator in SSE state
    (coordinator as any).currentTransportType.set('sse');
    (coordinator as any).activeTransport = (coordinator as any).sseTransport;
    (coordinator as any).consecutiveFailures = 0;

    // Simulate 3 SSE failures
    (coordinator as any).handleTransportFailure();
    (coordinator as any).handleTransportFailure();
    (coordinator as any).handleTransportFailure();

    expect(coordinator.currentTransportType()).toBe('polling');
  });
});
