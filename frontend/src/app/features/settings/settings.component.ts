import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface AppSettings {
  incidentAudioAlerts: boolean;
  refreshRateSeconds: number;
  incidentRetentionMinutes: number;
  environmentName: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="settings-container">
      <h2>System & Console Settings</h2>
      <p class="subtitle">Configured using Angular Template-driven Form.</p>

      @if (savedNotice()) {
        <div class="success-banner" role="status">
          {{ savedNotice() }}
        </div>
      }

      <form #settingsForm="ngForm" (ngSubmit)="onSubmit(settingsForm)" class="settings-form">
        <div class="form-group">
          <label for="environmentName">Environment Identifier *</label>
          <input
            type="text"
            id="environmentName"
            name="environmentName"
            class="form-control"
            [(ngModel)]="settings.environmentName"
            required
            minlength="3"
            #envRef="ngModel"
          />
          @if (envRef.invalid && envRef.touched) {
            <div class="field-error">Environment identifier is required (min 3 chars).</div>
          }
        </div>

        <div class="form-group">
          <label for="refreshRate">Metrics Display Update Cap (Seconds) *</label>
          <input
            type="number"
            id="refreshRate"
            name="refreshRateSeconds"
            class="form-control"
            [(ngModel)]="settings.refreshRateSeconds"
            required
            min="1"
            max="10"
            #rateRef="ngModel"
          />
          @if (rateRef.invalid && rateRef.touched) {
            <div class="field-error">Update cap must be between 1 and 10 seconds.</div>
          }
        </div>

        <div class="form-group">
          <label for="retentionMinutes">Incident In-Memory Retention (Minutes) *</label>
          <input
            type="number"
            id="retentionMinutes"
            name="incidentRetentionMinutes"
            class="form-control"
            [(ngModel)]="settings.incidentRetentionMinutes"
            required
            min="5"
            max="120"
            #retRef="ngModel"
          />
          @if (retRef.invalid && retRef.touched) {
            <div class="field-error">Retention must be between 5 and 120 minutes.</div>
          }
        </div>

        <div class="form-checkbox">
          <label class="checkbox-label">
            <input
              type="checkbox"
              name="incidentAudioAlerts"
              [(ngModel)]="settings.incidentAudioAlerts"
            />
            Play sound notification when critical incidents trigger
          </label>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn-primary" [disabled]="settingsForm.invalid">
            Save Console Settings
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .settings-container {
      max-width: 680px;
      margin: 0 auto;
      background: var(--bg-card, #1e222d);
      border: 1px solid var(--border-color, #2a2e39);
      border-radius: 8px;
      padding: 24px;
    }

    h2 {
      margin: 0;
      color: var(--text-primary, #ffffff);
    }

    .subtitle {
      margin: 4px 0 20px;
      color: var(--text-muted, #94a3b8);
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
      color: var(--text-primary, #e1e4ea);
    }

    .form-control {
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--border-color, #363c4e);
      background: var(--bg-input, #12141a);
      color: var(--text-primary, #e1e4ea);
      font-size: 13px;
    }

    .form-checkbox {
      margin: 20px 0;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      cursor: pointer;
    }

    .field-error {
      color: #f87171;
      font-size: 12px;
    }

    .success-banner {
      background: rgba(34, 197, 94, 0.15);
      border: 1px solid #22c55e;
      color: #86efac;
      padding: 10px 14px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 13px;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
      padding: 8px 18px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class SettingsComponent {
  public settings: AppSettings = {
    environmentName: 'Production-Fleet-EU',
    refreshRateSeconds: 2,
    incidentRetentionMinutes: 30,
    incidentAudioAlerts: true
  };

  public savedNotice = signal<string | null>(null);

  onSubmit(form: any): void {
    if (form.valid) {
      this.savedNotice.set('Console settings saved successfully!');
      setTimeout(() => this.savedNotice.set(null), 3000);
    }
  }
}
