import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor.js';
import { AuthService } from './auth.service.js';
import { APP_CONFIG } from '../config/app-config.js';

describe('AuthInterceptor (Concurrency Refresh Lock)', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let authService: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Router, useValue: { navigate: vi.fn(), url: '/' } },
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting()
      ]
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);

    // Seed mock initial expired access token and valid refresh token
    (authService as any).accessTokenSignal.set('expired-access-token');
    (authService as any).refreshTokenSignal.set('valid-refresh-token');
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should trigger exactly ONE refresh call when 10 requests fail with 401 token_expired simultaneously', () => {
    const responses: any[] = [];

    // Dispatch 10 parallel requests
    for (let i = 1; i <= 10; i++) {
      http.get(`${APP_CONFIG.apiBaseUrl}/services/svc-${i}`).subscribe((res) => {
        responses.push(res);
      });
    }

    // Expect 10 initial calls with expired token
    const initialRequests = httpTesting.match((req) => req.url.includes('/services/svc-'));
    expect(initialRequests.length).toBe(10);

    // Fail all 10 with 401 token_expired
    for (const req of initialRequests) {
      req.flush(
        { error: { code: 'token_expired', message: 'Token expired' } },
        { status: 401, statusText: 'Unauthorized' }
      );
    }

    // CRITICAL: Exactly ONE refresh call should go out!
    const refreshReq = httpTesting.expectOne(`${APP_CONFIG.apiBaseUrl}/auth/refresh`);
    expect(refreshReq.request.method).toBe('POST');
    expect(refreshReq.request.body).toEqual({ refreshToken: 'valid-refresh-token' });

    // Respond with fresh token
    refreshReq.flush({
      accessToken: 'new-valid-token',
      refreshToken: 'new-rotated-refresh-token',
      expiresIn: 60,
      user: { id: 'u-1', email: 'operator@pulse.dev', role: 'operator' }
    });

    // Expect all 10 requests to be replayed with the new token
    const replayedRequests = httpTesting.match((req) => req.url.includes('/services/svc-'));
    expect(replayedRequests.length).toBe(10);

    for (const req of replayedRequests) {
      expect(req.request.headers.get('Authorization')).toBe('Bearer new-valid-token');
      req.flush({ id: 'svc-data', ok: true });
    }

    // All 10 requests should successfully complete
    expect(responses.length).toBe(10);
  });
});
