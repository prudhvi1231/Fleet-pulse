import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { APP_CONFIG } from '../config/app-config.js';
import { User, AuthResponse } from '../models/auth.model.js';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  // In-memory token storage ONLY (Never persisted to localStorage / sessionStorage)
  private accessTokenSignal = signal<string | null>(null);
  private refreshTokenSignal = signal<string | null>(null);
  private currentUserSignal = signal<User | null>(null);

  public readonly accessToken = this.accessTokenSignal.asReadonly();
  public readonly currentUser = this.currentUserSignal.asReadonly();
  public readonly isAuthenticated = computed(() => !!this.accessTokenSignal());
  public readonly isOperator = computed(() => this.currentUserSignal()?.role === 'operator');
  public readonly isViewer = computed(() => this.currentUserSignal()?.role === 'viewer');

  private returnUrl: string | null = null;

  public setReturnUrl(url: string) {
    this.returnUrl = url;
  }

  public getReturnUrl(): string {
    return this.returnUrl || '/';
  }

  public login(credentials: { email: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${APP_CONFIG.apiBaseUrl}/auth/login`, credentials).pipe(
      tap((res) => {
        this.accessTokenSignal.set(res.accessToken);
        this.refreshTokenSignal.set(res.refreshToken);
        this.currentUserSignal.set(res.user);
      })
    );
  }

  public refreshToken(): Observable<AuthResponse> {
    const currentRefreshToken = this.refreshTokenSignal();
    if (!currentRefreshToken) {
      this.logout(true);
      return throwError(() => new Error('No refresh token available'));
    }

    return this.http.post<AuthResponse>(`${APP_CONFIG.apiBaseUrl}/auth/refresh`, {
      refreshToken: currentRefreshToken
    }).pipe(
      tap((res) => {
        this.accessTokenSignal.set(res.accessToken);
        this.refreshTokenSignal.set(res.refreshToken);
        this.currentUserSignal.set(res.user);
      }),
      catchError((err) => {
        // Failed refresh: clean logout, preserve returnUrl
        this.logout(true);
        return throwError(() => err);
      })
    );
  }

  public logout(preserveReturnUrl = true) {
    if (preserveReturnUrl && this.router.url !== '/login') {
      this.returnUrl = this.router.url;
    }
    this.accessTokenSignal.set(null);
    this.refreshTokenSignal.set(null);
    this.currentUserSignal.set(null);
    this.router.navigate(['/login']);
  }
}
