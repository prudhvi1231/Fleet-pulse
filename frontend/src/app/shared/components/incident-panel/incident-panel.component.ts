import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { RuleEvaluatorService } from '../../../features/rules/rule-evaluator.service.js';

@Component({
  selector: 'app-incident-panel',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <!-- Real-time Toast Alert Notification -->
    @if (evaluator.toastNotification()) {
      <div class="toast-notification" role="alert">
        <span class="toast-message">{{ evaluator.toastNotification() }}</span>
      </div>
    }

    <!-- Collapsible Incident Panel -->
    <div class="incident-drawer" [class.is-open]="isOpen()">
      <button class="drawer-toggle" (click)="toggleOpen()">
        <span class="toggle-icon">🔥</span>
        <span class="toggle-label">Active Incidents</span>
        @if (activeIncidentCount() > 0) {
          <span class="incident-badge">{{ activeIncidentCount() }}</span>
        }
      </button>

      @if (isOpen()) {
        <div class="drawer-content">
          <div class="drawer-header">
            <h4>Live Incident Feed</h4>
            <span class="drawer-sub">Evaluated in-browser against live stream</span>
          </div>

          <div class="incidents-list">
            @for (inc of evaluator.incidents(); track inc.id) {
              <div class="incident-item" [class.incident-resolved]="inc.status === 'resolved'">
                <div class="item-header">
                  <span class="service-id-tag">
                    <a [routerLink]="['/services', inc.serviceId]">{{ inc.serviceId }}</a>
                  </span>
                  <span class="status-indicator-tag" [ngClass]="inc.status">
                    {{ inc.status }}
                  </span>
                </div>
                <div class="item-body">
                  <div class="incident-rule">{{ inc.ruleName }}</div>
                  <div class="incident-details">
                    Breached: <strong>{{ inc.metric }} = {{ inc.value }}</strong> (threshold: {{ inc.threshold }})
                  </div>
                </div>
                <div class="item-footer">
                  <span class="time-ago">{{ formatTime(inc.firedAt) }}</span>
                  <button class="dismiss-btn" (click)="evaluator.dismissIncident(inc.id)">Dismiss</button>
                </div>
              </div>
            } @empty {
              <div class="no-incidents">
                <p>✅ Zero active incidents. All 2,000 services are operating within alert thresholds.</p>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      background: #dc2626;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(220, 38, 38, 0.4);
      font-size: 13px;
      font-weight: 600;
      animation: slide-in 0.3s ease-out;
    }

    @keyframes slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .incident-drawer {
      position: fixed;
      bottom: 0;
      right: 24px;
      z-index: 1000;
      width: 360px;
      background: var(--bg-card, #181b24);
      border: 1px solid var(--border-color, #2a2e39);
      border-bottom: none;
      border-radius: 10px 10px 0 0;
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.35);
      transition: height 0.2s ease;
    }

    .drawer-toggle {
      width: 100%;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      background: transparent;
      border: none;
      color: var(--text-primary, #ffffff);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
    }

    .incident-badge {
      background: #ef4444;
      color: white;
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 10px;
      margin-left: auto;
    }

    .drawer-content {
      max-height: 420px;
      display: flex;
      flex-direction: column;
      border-top: 1px solid var(--border-color, #2a2e39);
    }

    .drawer-header {
      padding: 12px 16px;
      background: var(--bg-header, #12141a);
    }

    .drawer-header h4 {
      margin: 0;
      font-size: 13px;
      color: var(--text-primary, #ffffff);
    }

    .drawer-sub {
      font-size: 11px;
      color: var(--text-muted, #94a3b8);
    }

    .incidents-list {
      overflow-y: auto;
      max-height: 340px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .incident-item {
      background: var(--bg-panel, #1e222d);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-left: 3px solid #ef4444;
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 12px;
    }

    .incident-item.incident-resolved {
      border-color: rgba(34, 197, 94, 0.3);
      border-left-color: #22c55e;
      opacity: 0.7;
    }

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .service-id-tag a {
      color: #60a5fa;
      text-decoration: none;
      font-weight: 600;
      font-family: monospace;
    }

    .status-indicator-tag {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .status-indicator-tag.active {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
    }

    .status-indicator-tag.resolved {
      background: rgba(34, 197, 94, 0.2);
      color: #4ade80;
    }

    .incident-rule {
      font-weight: 600;
      color: var(--text-primary, #ffffff);
      margin-bottom: 2px;
    }

    .incident-details {
      color: var(--text-muted, #94a3b8);
    }

    .item-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .time-ago {
      font-size: 11px;
      color: var(--text-muted, #64748b);
    }

    .dismiss-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 11px;
      cursor: pointer;
    }

    .dismiss-btn:hover {
      color: #ffffff;
    }

    .no-incidents {
      padding: 24px 16px;
      text-align: center;
      color: var(--text-muted, #94a3b8);
      font-size: 12px;
    }
  `]
})
export class IncidentPanelComponent {
  public evaluator = inject(RuleEvaluatorService);
  public isOpen = signal<boolean>(false);

  get activeIncidentCount(): () => number {
    return () => this.evaluator.incidents().filter((i) => i.status === 'active').length;
  }

  toggleOpen(): void {
    this.isOpen.update((v) => !v);
  }

  formatTime(ts: number): string {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return `${sec}s ago`;
    return `${Math.floor(sec / 60)}m ago`;
  }
}
