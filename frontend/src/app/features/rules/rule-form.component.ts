import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ComponentCanDeactivate } from './pending-changes.guard.js';
import { warningThresholdValidator, metricRangeValidator, uniqueNameValidator } from './validators/rule.validators.js';
import { Rule, RuleCondition } from '../../core/models/service.model.js';
import { APP_CONFIG } from '../../core/config/app-config.js';
import { RuleEvaluatorService } from './rule-evaluator.service.js';

@Component({
  selector: 'app-rule-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  template: `
    <div class="rule-form-container">
      <div class="form-header">
        <a routerLink="/rules" class="back-link">&larr; Back to Rules</a>
        <h2>{{ isEditMode ? 'Edit Alert Rule' : 'Create New Alert Rule' }}</h2>
      </div>

      @if (errorMessage) {
        <div class="error-banner" role="alert">
          {{ errorMessage }}
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="saveRule()" class="form-body">
        <!-- Rule Name with Async Uniqueness Validator -->
        <div class="form-group">
          <label for="rule-name" class="form-label">Rule Name *</label>
          <input
            id="rule-name"
            type="text"
            formControlName="name"
            class="form-control"
            placeholder="e.g. High Checkout Latency Spike"
          />
          @if (form.get('name')?.pending) {
            <span class="field-hint text-blue">Checking rule name availability...</span>
          }
          @if (form.get('name')?.touched && form.get('name')?.errors) {
            <div class="field-error">
              @if (form.get('name')?.errors?.['required']) { <span>Rule name is required.</span> }
              @if (form.get('name')?.errors?.['nameTaken']) { <span>Rule name is already taken.</span> }
            </div>
          }
        </div>

        <!-- Dynamic Conditions Array -->
        <div class="conditions-section">
          <div class="conditions-header">
            <h3>Conditions (Fires when all conditions match)</h3>
            <button type="button" class="btn-secondary" (click)="addCondition()">+ Add Condition</button>
          </div>

          <div formArrayName="conditions" class="conditions-list">
            @for (cond of conditions.controls; track $index; let idx = $index) {
              <div [formGroupName]="idx" class="condition-card">
                <div class="condition-top">
                  <span class="condition-index">Condition #{{ idx + 1 }}</span>
                  @if (conditions.length > 1) {
                    <button type="button" class="btn-remove" (click)="removeCondition(idx)">&times; Remove</button>
                  }
                </div>

                <div class="condition-grid">
                  <!-- Metric Selector (Dynamic field behavior) -->
                  <div class="form-group">
                    <label class="form-label">Metric</label>
                    <select formControlName="metric" class="form-control" (change)="onMetricChanged(idx)">
                      <option value="p95">p95 Latency (ms)</option>
                      <option value="errRate">Error Rate (%)</option>
                      <option value="rps">Throughput (RPS)</option>
                    </select>
                  </div>

                  <!-- Operator -->
                  <div class="form-group">
                    <label class="form-label">Operator</label>
                    <select formControlName="operator" class="form-control">
                      <option value=">">&gt; (Greater than)</option>
                      <option value=">=">&gt;= (Greater or equal)</option>
                      <option value="<">&lt; (Less than)</option>
                      <option value="<=">&lt;= (Less or equal)</option>
                    </select>
                  </div>

                  <!-- Critical Threshold -->
                  <div class="form-group">
                    <label class="form-label">
                      Critical Threshold
                      <span class="unit-label">({{ getMetricUnit(idx) }})</span>
                    </label>
                    <input
                      type="number"
                      formControlName="threshold"
                      class="form-control"
                      [placeholder]="getMetricPlaceholder(idx)"
                    />
                  </div>

                  <!-- Warning Threshold (Cross-Field Validator: Warning < Critical) -->
                  <div class="form-group">
                    <label class="form-label">
                      Warning Threshold
                      <span class="unit-label">(Optional)</span>
                    </label>
                    <input
                      type="number"
                      formControlName="warningThreshold"
                      class="form-control"
                      placeholder="e.g. Warning level"
                    />
                  </div>

                  <!-- Duration in Seconds -->
                  <div class="form-group">
                    <label class="form-label">Duration (Seconds)</label>
                    <input
                      type="number"
                      formControlName="durationSec"
                      class="form-control"
                      min="1"
                      placeholder="e.g. 15"
                    />
                  </div>
                </div>

                <!-- Custom Validator Error Messages -->
                @if (cond.errors?.['warningThresholdInvalid']) {
                  <div class="field-error mt-2">
                    {{ cond.errors?.['warningThresholdInvalid'] }}
                  </div>
                }
                @if (cond.errors?.['outOfRange']) {
                  <div class="field-error mt-2">
                    {{ cond.errors?.['outOfRange'] }}
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <div class="form-actions">
          <a routerLink="/rules" class="btn-cancel">Cancel</a>
          <button
            type="submit"
            class="btn-primary"
            [disabled]="form.invalid || isSubmitting"
          >
            {{ isSubmitting ? 'Saving...' : (isEditMode ? 'Update Rule' : 'Create Rule') }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .rule-form-container {
      max-width: 900px;
      margin: 0 auto;
      background: var(--bg-card, #1e222d);
      border: 1px solid var(--border-color, #2a2e39);
      border-radius: 8px;
      padding: 24px;
    }

    .form-header {
      margin-bottom: 24px;
    }

    .back-link {
      color: #60a5fa;
      font-size: 13px;
      text-decoration: none;
      display: inline-block;
      margin-bottom: 8px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 16px;
    }

    .form-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary, #e1e4ea);
    }

    .unit-label {
      color: var(--text-muted, #94a3b8);
      font-weight: 400;
    }

    .form-control {
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--border-color, #363c4e);
      background: var(--bg-input, #12141a);
      color: var(--text-primary, #e1e4ea);
      font-size: 13px;
      outline: none;
    }

    .form-control:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
    }

    .conditions-section {
      margin-top: 28px;
      border-top: 1px solid var(--border-color, #2a2e39);
      padding-top: 20px;
    }

    .conditions-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .conditions-header h3 {
      font-size: 15px;
      color: var(--text-primary, #ffffff);
      margin: 0;
    }

    .condition-card {
      background: var(--bg-panel, #151821);
      border: 1px solid var(--border-color, #2a2e39);
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .condition-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .condition-index {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted, #94a3b8);
      text-transform: uppercase;
    }

    .condition-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }

    .btn-remove {
      background: transparent;
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }

    .btn-remove:hover {
      background: rgba(239, 68, 68, 0.15);
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color, #2a2e39);
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

    .btn-secondary {
      background: transparent;
      border: 1px solid #3b82f6;
      color: #60a5fa;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
    }

    .btn-cancel {
      padding: 8px 16px;
      color: var(--text-muted, #94a3b8);
      text-decoration: none;
      font-size: 13px;
    }

    .field-error {
      color: #f87171;
      font-size: 12px;
      margin-top: 4px;
    }

    .text-blue {
      color: #60a5fa;
      font-size: 12px;
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
  `]
})
export class RuleFormComponent implements OnInit, ComponentCanDeactivate {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private evaluator = inject(RuleEvaluatorService);

  public form!: FormGroup;
  public isEditMode = false;
  public ruleId: string | null = null;
  public isSubmitting = false;
  public errorMessage: string | null = null;

  ngOnInit(): void {
    this.ruleId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.ruleId;

    this.form = this.fb.group({
      name: [
        '',
        [Validators.required, Validators.minLength(3)],
        [uniqueNameValidator(this.http, this.ruleId || undefined)]
      ],
      conditions: this.fb.array([])
    });

    if (this.isEditMode && this.ruleId) {
      this.loadExistingRule(this.ruleId);
    } else {
      this.addCondition();
    }
  }

  get conditions(): FormArray {
    return this.form.get('conditions') as FormArray;
  }

  addCondition(existing?: RuleCondition): void {
    const conditionGroup = this.fb.group(
      {
        metric: [existing?.metric || 'p95', Validators.required],
        operator: [existing?.operator || '>', Validators.required],
        threshold: [existing?.threshold ?? 500, [Validators.required, Validators.min(0)]],
        warningThreshold: [existing?.warningThreshold ?? null],
        durationSec: [existing?.durationSec ?? 15, [Validators.required, Validators.min(1)]]
      },
      {
        validators: [warningThresholdValidator(), metricRangeValidator()]
      }
    );

    this.conditions.push(conditionGroup);
  }

  removeCondition(index: number): void {
    if (this.conditions.length > 1) {
      this.conditions.removeAt(index);
      this.form.markAsDirty();
    }
  }

  onMetricChanged(idx: number): void {
    const cond = this.conditions.at(idx);
    const metric = cond.get('metric')?.value;
    if (metric === 'errRate') {
      cond.get('threshold')?.setValue(5);
    } else if (metric === 'p95') {
      cond.get('threshold')?.setValue(500);
    } else if (metric === 'rps') {
      cond.get('threshold')?.setValue(1500);
    }
    cond.updateValueAndValidity();
  }

  getMetricUnit(idx: number): string {
    const metric = this.conditions.at(idx).get('metric')?.value;
    return metric === 'errRate' ? '%' : metric === 'p95' ? 'ms' : 'req/s';
  }

  getMetricPlaceholder(idx: number): string {
    const metric = this.conditions.at(idx).get('metric')?.value;
    return metric === 'errRate' ? 'e.g. 5.0' : metric === 'p95' ? 'e.g. 500' : 'e.g. 1200';
  }

  private loadExistingRule(id: string): void {
    this.http.get<Rule>(`${APP_CONFIG.apiBaseUrl}/rules/${id}`).subscribe({
      next: (rule) => {
        this.form.patchValue({ name: rule.name });
        this.conditions.clear();
        for (const cond of rule.conditions) {
          this.addCondition(cond);
        }
        this.form.markAsPristine();
      },
      error: () => {
        this.errorMessage = 'Failed to load rule details.';
      }
    });
  }

  // D5: Unsaved changes confirmation
  canDeactivate(): boolean {
    if (this.form.dirty && !this.isSubmitting) {
      return false;
    }
    return true;
  }

  saveRule(): void {
    if (this.form.invalid) return;

    this.isSubmitting = true;
    this.errorMessage = null;

    const payload = this.form.value;
    // D6: Send Idempotency-Key header on POST
    const idempotencyKey = `rule-post-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const req$ = this.isEditMode
      ? this.http.put<Rule>(`${APP_CONFIG.apiBaseUrl}/rules/${this.ruleId}`, payload)
      : this.http.post<Rule>(`${APP_CONFIG.apiBaseUrl}/rules`, payload, {
          headers: { 'Idempotency-Key': idempotencyKey }
        });

    req$.subscribe({
      next: () => {
        this.form.markAsPristine();
        this.evaluator.loadRules();
        this.router.navigate(['/rules']);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err.error?.error?.message || 'Failed to save rule. Please try again.';
      }
    });
  }
}
