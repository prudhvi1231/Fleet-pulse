import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, throwError, Observable } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { AuthService } from './auth.service.js';

let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const authService = inject(AuthService);

  // Bypass auth header for /auth/* and /chaos endpoints
  if (req.url.includes('/auth/') || req.url.includes('/chaos') || req.url.includes('/health')) {
    return next(req);
  }

  const token = authService.accessToken();
  let authReq = req;
  if (token) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        const errorCode = error.error?.error?.code;

        // If the refresh call itself failed with refresh_invalid, clean logout
        if (req.url.includes('/auth/refresh') || errorCode === 'refresh_invalid') {
          authService.logout(true);
          return throwError(() => error);
        }

        // Token expired or invalid: handle concurrency lock
        return handle401Error(authReq, next, authService);
      }

      return throwError(() => error);
    })
  );
};

function handle401Error(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService
): Observable<any> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    return authService.refreshToken().pipe(
      switchMap((res) => {
        isRefreshing = false;
        refreshTokenSubject.next(res.accessToken);
        // Replay original request with new token
        return next(
          req.clone({
            setHeaders: { Authorization: `Bearer ${res.accessToken}` }
          })
        );
      }),
      catchError((err) => {
        isRefreshing = false;
        authService.logout(true);
        return throwError(() => err);
      })
    );
  } else {
    // If refresh is already in-flight, wait until it emits a new token and replay
    return refreshTokenSubject.pipe(
      filter((token) => token !== null),
      take(1),
      switchMap((token) => {
        return next(
          req.clone({
            setHeaders: { Authorization: `Bearer ${token}` }
          })
        );
      })
    );
  }
}
