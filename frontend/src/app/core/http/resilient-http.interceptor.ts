import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { timeout, retry, timer, throwError } from 'rxjs';
import { APP_CONFIG } from '../config/app-config.js';

export const resilientHttpInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  return next(req).pipe(
    // 10s request timeout on all requests
    timeout(APP_CONFIG.httpTimeoutMs),
    retry({
      count: APP_CONFIG.maxHttpRetries,
      delay: (error: unknown, retryCount: number) => {
        if (!(error instanceof HttpErrorResponse)) {
          // e.g. TimeoutError or unknown
          return timer(Math.pow(2, retryCount) * 500);
        }

        // Never retry other 4xx errors (e.g. 400, 401, 403, 404, 409, 410, 422)
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          return throwError(() => error);
        }

        // Determine if request is retryable:
        // Must be GET, OR a POST with Idempotency-Key
        const isGet = req.method.toUpperCase() === 'GET';
        const isIdempotentPost = req.method.toUpperCase() === 'POST' && req.headers.has('Idempotency-Key');

        if (!isGet && !isIdempotentPost) {
          return throwError(() => error);
        }

        // Retryable status codes: network error (0), 502, 503, 504, or 429
        const isRetryableStatus =
          error.status === 0 ||
          error.status === 502 ||
          error.status === 503 ||
          error.status === 504 ||
          error.status === 429;

        if (!isRetryableStatus) {
          return throwError(() => error);
        }

        // Honor Retry-After on 429 if present
        if (error.status === 429) {
          const retryAfterHeader = error.headers.get('Retry-After');
          if (retryAfterHeader) {
            const delaySec = parseInt(retryAfterHeader, 10);
            if (!isNaN(delaySec) && delaySec > 0) {
              return timer(delaySec * 1000);
            }
          }
        }

        // Exponential backoff
        const delayMs = Math.min(Math.pow(2, retryCount) * 500, 5000);
        return timer(delayMs);
      }
    })
  );
};
