export type Role = 'viewer' | 'operator';

export interface User {
  id: string;
  email: string;
  role: Role;
}

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

export interface RuleCondition {
  metric: 'p95' | 'errRate' | 'rps';
  operator: '>' | '>=' | '<' | '<=';
  threshold: number;
  durationSec: number;
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

export interface ChaosState {
  rate: number;                    // 1 to 5000, default 500
  ws?: 'down' | 'silent' | string; // 'down', 'silent'
  sse?: 'down' | string;           // 'down'
  wsDropPct?: number;              // 0 to 100
  shuffle?: boolean;               // events reordered up to 1s
  dupe?: boolean;                  // ~10% duplicated within 1s
  garbagePct?: number;             // % frames invalid JSON or missing fields
  tokenTtl?: number;               // seconds
  http500Pct?: number;             // % REST calls return 500
  httpSlowMs?: number;             // delay in ms
  http429?: boolean;               // return 429 Retry-After: 2
  killIntervalSec?: number;        // drop connections every N seconds
}
