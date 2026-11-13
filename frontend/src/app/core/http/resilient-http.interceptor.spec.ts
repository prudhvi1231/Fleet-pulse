import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { resilientHttpInterceptor } from './resilient-http.interceptor.js';
import { APP_CONFIG } from '../config/app-config.js';

describe('ResilientHttpInterceptor (Retry Policy)', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([resilientHttpInterceptor])),
        provideHttpClientTesting()
      ]
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should not retry 4xx errors other than 429 (e.g. 400 Bad Request)', () => {
    let errorCaught = false;

    http.get(`${APP_CONFIG.apiBaseUrl}/test-400`).subscribe({
      next: () => {},
      error: (err) => {
        errorCaught = true;
        expect(err.status).toBe(400);
      }
    });

    const req = httpTesting.expectOne(`${APP_CONFIG.apiBaseUrl}/test-400`);
    req.flush('Bad request', { status: 400, statusText: 'Bad Request' });

    // No retry should occur
    httpTesting.expectNone(`${APP_CONFIG.apiBaseUrl}/test-400`);
    expect(errorCaught).toBe(true);
  });

  it('should not retry non-idempotent POST requests without Idempotency-Key on 500 error', () => {
    let errorCaught = false;

    http.post(`${APP_CONFIG.apiBaseUrl}/test-post`, { data: 'test' }).subscribe({
      next: () => {},
      error: (err) => {
        errorCaught = true;
        expect(err.status).toBe(500);
      }
    });

    const req = httpTesting.expectOne(`${APP_CONFIG.apiBaseUrl}/test-post`);
    req.flush('Server error', { status: 500, statusText: 'Internal Server Error' });

    // POST without idempotency key MUST NOT be retried
    httpTesting.expectNone(`${APP_CONFIG.apiBaseUrl}/test-post`);
    expect(errorCaught).toBe(true);
  });
});
