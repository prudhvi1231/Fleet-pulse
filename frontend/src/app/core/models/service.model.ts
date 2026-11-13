export type ServiceStatus = 'healthy' | 'degraded' | 'down';

export interface Service {
  id: string;
  name: string;
  team: string;
  status: ServiceStatus;
}

export interface MetricEvent {
  type: 'metric';
  offset: number;
  serviceId: string;
  seq: number;
  ts: number;
  p95: number;
  errRate: number;
  rps: number;
  status: ServiceStatus;
}

export interface PingEvent {
  type: 'ping';
  ts: number;
}

export type StreamEvent = MetricEvent | PingEvent;

export interface HistoryPoint {
  ts: number;
  p95: number;
  errRate: number;
  rps: number;
}

export interface ServiceHistoryResponse {
  serviceId: string;
  points: HistoryPoint[];
}

export interface MetricsSnapshotResponse {
  offset: number;
  ts: number;
  metrics: MetricEvent[];
}

export interface MetricsReplayResponse {
  events: MetricEvent[];
  offset: number;
}

export interface RuleCondition {
  metric: 'p95' | 'errRate' | 'rps';
  operator: '>' | '>=' | '<' | '<=';
  threshold: number;
  durationSec: number;
  warningThreshold?: number; // for cross-field validator
  [key: string]: any;
}

export interface Rule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  createdAt: number;
  updatedAt: number;
  [key: string]: any;
}

export interface Incident {
  id: string;
  ruleId: string;
  ruleName: string;
  serviceId: string;
  metric: string;
  value: number;
  threshold: number;
  firedAt: number;
  status: 'active' | 'resolved';
}
