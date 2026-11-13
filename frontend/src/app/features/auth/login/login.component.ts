import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service.js';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="login-wrapper">
      <div class="login-card">
        <div class="brand">
          <div class="logo-circle">⚡</div>
          <h1>Fleet Pulse</h1>
          <p class="tagline">Microservices Incident & Telemetry Console</p>
        </div>

        @if (serverError) {
          <div class="error-banner" role="alert">
            {{ serverError }}
          </div>
        }

        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="login-form">
          <div class="form-group">
            <label for="email">Work Email</label>
            <input
              id="email"
              type="email"
              formControlName="email"
              class="form-control"
              placeholder="e.g. operator@pulse.dev"
              autocomplete="email"
            />
            @if (loginForm.get('email')?.touched && loginForm.get('email')?.errors) {
              <div class="field-error">
                @if (loginForm.get('email')?.errors?.['required']) { <span>Email is required.</span> }
                @if (loginForm.get('email')?.errors?.['email']) { <span>Please enter a valid email.</span> }
              </div>
            }
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              id="password"
              type="password"
              formControlName="password"
              class="form-control"
              placeholder="••••••••"
              autocomplete="current-password"
            />
            @if (loginForm.get('password')?.touched && loginForm.get('password')?.errors) {
              <div class="field-error">
                <span>Password is required.</span>
              </div>
            }
          </div>

          <button
            type="submit"
            class="submit-btn"
            [disabled]="loginForm.invalid || isPending"
          >
            {{ isPending ? 'Authenticating...' : 'Sign In to Console' }}
          </button>
        </form>

        <div class="reviewer-help">
          <p class="help-title">Reviewer Quick-Fill:</p>
          <div class="quick-fill-buttons">
            <button type="button" class="quick-btn" (click)="fillTestUser('operator')">
              Operator Role (operator&#64;pulse.dev)
            </button>
            <button type="button" class="quick-btn" (click)="fillTestUser('viewer')">
              Viewer Role (viewer&#64;pulse.dev)
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-wrapper {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 20%, #1e222d 0%, #0d0f15 100%);
      padding: 20px;
    }

    .login-card {
      width: 100%;
      max-width: 420px;
      background: var(--bg-card, #181b24);
      border: 1px solid var(--border-color, #2a2e39);
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
    }

    .brand {
      text-align: center;
      margin-bottom: 24px;
    }

    .logo-circle {
      width: 48px;
      height: 48px;
      margin: 0 auto 12px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }

    h1 {
      margin: 0;
      font-size: 24px;
      color: #ffffff;
      font-weight: 700;
    }

    .tagline {
      margin: 6px 0 0;
      font-size: 13px;
      color: #94a3b8;
    }

    .error-banner {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid #ef4444;
      color: #fca5a5;
      padding: 10px 14px;
      border-radius: 6px;
      margin-bottom: 20px;
      font-size: 13px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 18px;
    }

    label {
      font-size: 13px;
      font-weight: 500;
      color: #e1e4ea;
    }

    .form-control {
      padding: 10px 12px;
      border-radius: 6px;
      border: 1px solid #363c4e;
      background: #12141a;
      color: #ffffff;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    .form-control:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
    }

    .field-error {
      color: #f87171;
      font-size: 12px;
    }

    .submit-btn {
      width: 100%;
      padding: 10px;
      border-radius: 6px;
      border: none;
      background: #3b82f6;
      color: white;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 8px;
      transition: background 0.2s;
    }

    .submit-btn:hover:not(:disabled) {
      background: #2563eb;
    }

    .submit-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .reviewer-help {
      margin-top: 28px;
      padding-top: 20px;
      border-top: 1px solid #2a2e39;
    }

    .help-title {
      margin: 0 0 10px;
      font-size: 12px;
      color: #94a3b8;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .quick-fill-buttons {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .quick-btn {
      padding: 8px 12px;
      font-size: 12px;
      background: #1e222d;
      border: 1px solid #363c4e;
      color: #93c5fd;
      border-radius: 6px;
      cursor: pointer;
      text-align: left;
      transition: background-color 0.15s;
    }

    .quick-btn:hover {
      background: #232736;
      border-color: #60a5fa;
    }
  `]
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  public isPending = false;
  public serverError: string | null = null;

  public loginForm: FormGroup = this.fb.group({
    email: ['operator@pulse.dev', [Validators.required, Validators.email]],
    password: ['pulse123', [Validators.required]]
  });

  fillTestUser(role: 'operator' | 'viewer'): void {
    if (role === 'operator') {
      this.loginForm.setValue({
        email: 'operator@pulse.dev',
        password: 'pulse123'
      });
    } else {
      this.loginForm.setValue({
        email: 'viewer@pulse.dev',
        password: 'pulse123'
      });
    }
    this.serverError = null;
  }

  onSubmit(): void {
    if (this.loginForm.invalid || this.isPending) return;

    this.isPending = true;
    this.serverError = null;

    this.authService.login(this.loginForm.value).subscribe({
      next: () => {
        this.isPending = false;
        const returnUrl = this.authService.getReturnUrl();
        this.router.navigateByUrl(returnUrl);
      },
      error: (err) => {
        this.isPending = false;
        this.serverError = err.error?.error?.message || 'Authentication failed. Please verify your credentials.';
      }
    });
  }
}
