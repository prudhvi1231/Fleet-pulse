import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Rule } from '../../core/models/service.model.js';
import { APP_CONFIG } from '../../core/config/app-config.js';
import { AuthService } from '../../core/auth/auth.service.js';
import { HasRoleDirective } from '../../shared/directives/has-role.directive.js';
import { RuleEvaluatorService } from './rule-evaluator.service.js';

@Component({
  selector: 'app-rule-list',
  standalone: true,
  imports: [CommonModule, RouterModule, HasRoleDirective],
  template: `
    <div class="rules-container">
      <div class="rules-header">
        <div>
          <h2>Alert Rules Engine</h2>
          <p class="subtitle">Rules evaluate live in the browser against the microservice event stream.</p>
        </div>
        <div *appHasRole="'operator'">
          <a routerLink="/rules/new" class="btn-create">+ Create Alert Rule</a>
        </div>
      </div>

      @if (errorMessage()) {
        <div class="error-banner" role="alert">
          {{ errorMessage() }}
        </div>
      }

      @if (isLoading()) {
        <div class="loading-state">Loading alert rules...</div>
      } @else {
        <div class="rules-grid">
          @for (rule of rules(); track rule.id) {
            <div class="rule-card">
              <div class="rule-card-header">
                <div>
                  <h3 class="rule-title">{{ rule.name }}</h3>
                  <span class="rule-meta">ID: {{ rule.id }} &bull; Conditions: {{ rule.conditions.length }}</span>
                </div>
                <div class="rule-actions" *appHasRole="'operator'">
                  <a [routerLink]="['/rules', rule.id, 'edit']" class="btn-action edit-btn">Edit</a>
                  <button (click)="deleteRuleOptimistic(rule.id)" class="btn-action delete-btn">Delete</button>
                </div>
              </div>

              <div class="conditions-container">
                <span class="conditions-tag">Conditions:</span>
                <ul class="condition-items">
                  @for (cond of rule.conditions; track $index) {
                    <li>
                      <strong>{{ cond.metric }}</strong> {{ cond.operator }} <strong>{{ cond.threshold }}</strong>
                      @if (cond.warningThreshold) {
                        <span class="warning-tag">(warn: {{ cond.warningThreshold }})</span>
                      }
                      for <strong>{{ cond.durationSec }}s</strong>
                    </li>
                  }
                </ul>
              </div>
            </div>
          } @empty {
            <div class="empty-state">
              <p>No alert rules configured yet.</p>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .rules-container {
      background: var(--bg-card, #1e222d);
      border: 1px solid var(--border-color, #2a2e39);
      border-radius: 8px;
      padding: 24px;
    }

    .rules-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color, #2a2e39);
    }

    .rules-header h2 {
      margin: 0;
      color: var(--text-primary, #ffffff);
      font-size: 20px;
    }

    .subtitle {
      margin: 4px 0 0;
      font-size: 13px;
      color: var(--text-muted, #94a3b8);
    }

    .btn-create {
      background: #3b82f6;
      color: white;
      text-decoration: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
    }

    .btn-create:hover {
      background: #2563eb;
    }

    .rules-grid {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .rule-card {
      background: var(--bg-panel, #151821);
      border: 1px solid var(--border-color, #2a2e39);
      border-radius: 6px;
      padding: 16px 20px;
    }

    .rule-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .rule-title {
      margin: 0;
      font-size: 16px;
      color: var(--text-primary, #ffffff);
    }

    .rule-meta {
      font-size: 12px;
      color: var(--text-muted, #94a3b8);
    }

    .rule-actions {
      display: flex;
      gap: 8px;
    }

    .btn-action {
      padding: 4px 10px;
      font-size: 12px;
      border-radius: 4px;
      cursor: pointer;
      text-decoration: none;
    }

    .edit-btn {
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.3);
      color: #60a5fa;
    }

    .delete-btn {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
    }

    .conditions-container {
      font-size: 13px;
      color: var(--text-muted, #94a3b8);
    }

    .condition-items {
      margin: 6px 0 0;
      padding-left: 20px;
    }

    .condition-items li {
      margin-bottom: 4px;
      color: var(--text-primary, #e1e4ea);
    }

    .warning-tag {
      font-size: 11px;
      color: #facc15;
    }

    .error-banner {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid #ef4444;
      color: #fca5a5;
      padding: 10px 14px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 13px;
    }

    .loading-state, .empty-state {
      padding: 40px;
      text-align: center;
      color: var(--text-muted, #94a3b8);
    }
  `]
})
export class RuleListComponent implements OnInit {
  private http = inject(HttpClient);
  public authService = inject(AuthService);
  private evaluator = inject(RuleEvaluatorService);

  public rules = signal<Rule[]>([]);
  public isLoading = signal<boolean>(true);
  public errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.loadRules();
  }

  loadRules(): void {
    this.isLoading.set(true);
    this.http.get<Rule[]>(`${APP_CONFIG.apiBaseUrl}/rules`).subscribe({
      next: (data) => {
        this.rules.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load rules.');
        this.isLoading.set(false);
      }
    });
  }

  // D6: Optimistic UI update with rollback on failure
  deleteRuleOptimistic(ruleId: string): void {
    if (!confirm('Are you sure you want to delete this alert rule?')) return;

    const previousRules = this.rules();
    // Optimistically remove from UI
    this.rules.set(previousRules.filter((r) => r.id !== ruleId));
    this.errorMessage.set(null);

    this.http.delete(`${APP_CONFIG.apiBaseUrl}/rules/${ruleId}`).subscribe({
      next: () => {
        this.evaluator.loadRules();
      },
      error: (err) => {
        // Rollback to previous state and show error!
        this.rules.set(previousRules);
        this.errorMessage.set(err.error?.error?.message || 'Server rejected rule deletion. Reverted changes.');
      }
    });
  }
}
