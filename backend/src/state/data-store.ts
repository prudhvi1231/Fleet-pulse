import { Service, ServiceStatus, MetricEvent, HistoryPoint, Rule, User } from '../types.js';
import { chaosStore } from './chaos-store.js';

class DataStore {
  public services: Service[] = [];
  public latestMetrics: Map<string, MetricEvent> = new Map();
  public serviceSeq: Map<string, number> = new Map();
  public history: Map<string, HistoryPoint[]> = new Map();
  
  public globalOffset: number = 9182700;
  
  // Replay ring buffer (stores up to 100,000 events, min 5 minutes)
  private replayBuffer: MetricEvent[] = [];
  private maxReplayEvents = 100000;

  // Rules store
  public rules: Rule[] = [];
  public idempotencyMap: Map<string, { status: number; body: any }> = new Map();

  // Auth tokens
  public activeTokens: Map<string, { userId: string; role: 'operator' | 'viewer'; expiresAt: number }> = new Map();
  public refreshTokens: Map<string, { userId: string; role: 'operator' | 'viewer' }> = new Map();

  // Test users
  public users: Map<string, User & { passwordHash: string }> = new Map([
    ['operator@pulse.dev', { id: 'u-1', email: 'operator@pulse.dev', role: 'operator', passwordHash: 'pulse123' }],
    ['viewer@pulse.dev', { id: 'u-2', email: 'viewer@pulse.dev', role: 'viewer', passwordHash: 'pulse123' }]
  ]);

  constructor() {
    this.initServices();
    this.initHistory();
    this.initDefaultRules();
  }

  private initServices() {
    const teams = ['payments', 'checkout', 'identity', 'platform', 'infra', 'analytics', 'logistics', 'search', 'catalog', 'notifications'];
    const names = ['api', 'service', 'worker', 'gateway', 'processor', 'router', 'sync', 'consumer'];

    for (let i = 1; i <= 2000; i++) {
      const id = `svc-${String(i).padStart(4, '0')}`;
      const team = teams[i % teams.length];
      const name = `${team}-${names[i % names.length]}-${i}`;
      const status: ServiceStatus = i % 25 === 0 ? 'down' : i % 8 === 0 ? 'degraded' : 'healthy';

      const svc: Service = { id, name, team, status };
      this.services.push(svc);
      this.serviceSeq.set(id, 10000 + i);

      const metric: MetricEvent = {
        type: 'metric',
        offset: this.globalOffset++,
        serviceId: id,
        seq: this.serviceSeq.get(id)!,
        ts: Date.now(),
        p95: status === 'down' ? 1200 : status === 'degraded' ? 450 : Math.floor(80 + Math.random() * 120),
        errRate: status === 'down' ? 45.0 : status === 'degraded' ? 8.5 : +(Math.random() * 1.5).toFixed(1),
        rps: status === 'down' ? 20 : Math.floor(500 + Math.random() * 1500),
        status
      };
      this.latestMetrics.set(id, metric);
    }
  }

  private initHistory() {
    const now = Date.now();
    // Pre-populate 60 min of 1-sec history for services (generate on demand or for sampled set, prefill first 50)
    for (let i = 1; i <= 50; i++) {
      const id = `svc-${String(i).padStart(4, '0')}`;
      this.generateHistoryForService(id, 60, now);
    }
  }

  public getHistoryForService(serviceId: string, minutes: number): HistoryPoint[] {
    const clampedMinutes = Math.min(Math.max(minutes || 15, 1), 60);
    const count = clampedMinutes * 60;
    const now = Date.now();

    if (!this.history.has(serviceId)) {
      this.generateHistoryForService(serviceId, 60, now);
    }

    const full = this.history.get(serviceId)!;
    return full.slice(-count);
  }

  private generateHistoryForService(serviceId: string, minutes: number, endTs: number) {
    const points: HistoryPoint[] = [];
    const count = minutes * 60;
    const svc = this.services.find(s => s.id === serviceId);
    const baseP95 = svc?.status === 'down' ? 1000 : svc?.status === 'degraded' ? 400 : 120;
    const baseErr = svc?.status === 'down' ? 30 : svc?.status === 'degraded' ? 6 : 0.5;

    for (let i = count - 1; i >= 0; i--) {
      const ts = endTs - i * 1000;
      points.push({
        ts,
        p95: Math.max(20, Math.floor(baseP95 + (Math.sin(i / 30) * 40) + (Math.random() * 30 - 15))),
        errRate: +Math.max(0, +(baseErr + (Math.random() * 1.2 - 0.6)).toFixed(1)),
        rps: Math.max(50, Math.floor(1200 + (Math.cos(i / 60) * 300) + (Math.random() * 100 - 50)))
      });
    }
    this.history.set(serviceId, points);
  }

  private initDefaultRules() {
    const now = Date.now();
    this.rules = [
      {
        id: 'r-1',
        name: 'High Latency Breach',
        conditions: [
          { metric: 'p95', operator: '>', threshold: 500, durationSec: 15 }
        ],
        createdAt: now - 3600000,
        updatedAt: now - 3600000
      },
      {
        id: 'r-2',
        name: 'Critical Error Spike',
        conditions: [
          { metric: 'errRate', operator: '>=', threshold: 10, durationSec: 10 }
        ],
        createdAt: now - 1800000,
        updatedAt: now - 1800000
      }
    ];
  }

  public recordEvent(event: MetricEvent) {
    this.latestMetrics.set(event.serviceId, event);
    this.replayBuffer.push(event);
    if (this.replayBuffer.length > this.maxReplayEvents) {
      this.replayBuffer.shift();
    }
  }

  public getReplay(sinceOffset: number): { events: MetricEvent[]; offset: number } | null {
    if (this.replayBuffer.length === 0) {
      return { events: [], offset: this.globalOffset };
    }

    const oldest = this.replayBuffer[0].offset;
    // If request offset is older than available history (more than 5 min old / buffer start)
    if (sinceOffset < oldest - 1) {
      return null; // Signals 410 replay_too_old
    }

    const events = this.replayBuffer.filter(e => e.offset > sinceOffset);
    return {
      events,
      offset: this.globalOffset
    };
  }

  // Token management
  public createTokens(user: User): { accessToken: string; refreshToken: string; expiresIn: number } {
    const chaos = chaosStore.getGlobal();
    const expiresIn = chaos.tokenTtl && chaos.tokenTtl > 0 ? chaos.tokenTtl : 60;
    const accessToken = `at-${user.role}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const refreshToken = `rt-${user.role}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    this.activeTokens.set(accessToken, {
      userId: user.id,
      role: user.role,
      expiresAt: Date.now() + expiresIn * 1000
    });

    this.refreshTokens.set(refreshToken, {
      userId: user.id,
      role: user.role
    });

    return { accessToken, refreshToken, expiresIn };
  }

  public validateAccessToken(token: string): { valid: boolean; expired: boolean; user?: { userId: string; role: 'operator' | 'viewer' } } {
    const entry = this.activeTokens.get(token);
    if (!entry) {
      return { valid: false, expired: false };
    }
    if (Date.now() > entry.expiresAt) {
      return { valid: false, expired: true, user: { userId: entry.userId, role: entry.role } };
    }
    return { valid: true, expired: false, user: { userId: entry.userId, role: entry.role } };
  }

  public rotateRefreshToken(oldRefreshToken: string): { accessToken: string; refreshToken: string; expiresIn: number; user: User } | null {
    const entry = this.refreshTokens.get(oldRefreshToken);
    if (!entry) {
      return null;
    }
    // Invalidate old refresh token (strict rotation)
    this.refreshTokens.delete(oldRefreshToken);

    const fullUser = Array.from(this.users.values()).find(u => u.id === entry.userId);
    if (!fullUser) return null;

    const tokens = this.createTokens(fullUser);
    return {
      ...tokens,
      user: {
        id: fullUser.id,
        email: fullUser.email,
        role: fullUser.role
      }
    };
  }
}

export const dataStore = new DataStore();
