import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Rule, Incident, MetricEvent } from '../../core/models/service.model.js';
import { StreamPipelineService } from '../../core/stream/stream-pipeline.service.js';
import { APP_CONFIG } from '../../core/config/app-config.js';

interface ConditionTracker {
  ruleId: string;
  serviceId: string;
  firstBreachTs: number;
}

@Injectable({
  providedIn: 'root'
})
export class RuleEvaluatorService {
  private pipeline = inject(StreamPipelineService);
  private http = inject(HttpClient);

  public readonly activeRules = signal<Rule[]>([]);
  public readonly incidents = signal<Incident[]>([]);
  public readonly toastNotification = signal<string | null>(null);

  // Tracks breaches: key = `${ruleId}_${serviceId}_${metric}`
  private breachTrackers = new Map<string, ConditionTracker>();
  // Set of currently firing incident keys to ensure same incident doesn't fire twice
  private firingIncidentKeys = new Set<string>();

  private streamSub: Subscription | null = null;
  private toastTimer: any = null;

  public init() {
    this.loadRules();

    this.streamSub = this.pipeline.metricEvents$.subscribe((event: MetricEvent) => {
      this.evaluateEvent(event);
    });
  }

  public destroy() {
    if (this.streamSub) this.streamSub.unsubscribe();
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  public loadRules() {
    this.http.get<Rule[]>(`${APP_CONFIG.apiBaseUrl}/rules`).subscribe({
      next: (rules) => {
        this.activeRules.set(rules);
      }
    });
  }

  private evaluateEvent(event: MetricEvent) {
    const rules = this.activeRules();
    const eventTime = event.ts || Date.now();

    for (const rule of rules) {
      for (const cond of rule.conditions) {
        const metricVal = event[cond.metric];
        const isBreached = this.testCondition(metricVal, cond.operator, cond.threshold);
        const trackerKey = `${rule.id}_${event.serviceId}_${cond.metric}`;

        if (isBreached) {
          if (!this.breachTrackers.has(trackerKey)) {
            this.breachTrackers.set(trackerKey, {
              ruleId: rule.id,
              serviceId: event.serviceId,
              firstBreachTs: eventTime
            });
          }

          const tracker = this.breachTrackers.get(trackerKey)!;
          const breachDurationSec = (eventTime - tracker.firstBreachTs) / 1000;

          // If breach duration >= required durationSec
          if (breachDurationSec >= cond.durationSec) {
            // Deduplication: ensure the same incident does not fire twice while active
            if (!this.firingIncidentKeys.has(trackerKey)) {
              this.firingIncidentKeys.add(trackerKey);
              this.fireIncident(rule, event, cond.metric, metricVal, cond.threshold, eventTime);
            }
          }
        } else {
          // Condition resolved
          if (this.breachTrackers.has(trackerKey)) {
            this.breachTrackers.delete(trackerKey);
          }
          if (this.firingIncidentKeys.has(trackerKey)) {
            this.firingIncidentKeys.delete(trackerKey);
            this.resolveIncident(rule.id, event.serviceId, cond.metric);
          }
        }
      }
    }
  }

  private testCondition(val: number, op: string, threshold: number): boolean {
    switch (op) {
      case '>': return val > threshold;
      case '>=': return val >= threshold;
      case '<': return val < threshold;
      case '<=': return val <= threshold;
      default: return false;
    }
  }

  private fireIncident(rule: Rule, event: MetricEvent, metric: string, val: number, threshold: number, firedAt: number) {
    const incident: Incident = {
      id: `inc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      serviceId: event.serviceId,
      metric,
      value: val,
      threshold,
      firedAt,
      status: 'active'
    };

    this.incidents.update((list) => [incident, ...list]);
    this.showToast(`🚨 Alert Fired: "${rule.name}" triggered on ${event.serviceId} (${metric}=${val})`);
  }

  private resolveIncident(ruleId: string, serviceId: string, metric: string) {
    this.incidents.update((list) =>
      list.map((inc) => {
        if (inc.ruleId === ruleId && inc.serviceId === serviceId && inc.metric === metric && inc.status === 'active') {
          return { ...inc, status: 'resolved' };
        }
        return inc;
      })
    );
  }

  private showToast(message: string) {
    this.toastNotification.set(message);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastNotification.set(null);
    }, 4500);
  }

  public dismissIncident(incidentId: string) {
    this.incidents.update((list) => list.filter((i) => i.id !== incidentId));
  }
}
