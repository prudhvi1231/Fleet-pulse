import { EventEmitter } from 'events';
import { MetricEvent, PingEvent, ServiceStatus, ChaosState } from '../types.js';
import { dataStore } from '../state/data-store.js';
import { chaosStore } from '../state/chaos-store.js';

export interface GeneratedFrame {
  type: 'metric' | 'ping' | 'garbage';
  rawText: string;
  event?: MetricEvent | PingEvent;
  offset?: number;
  isDrop?: boolean;
}

class EventGenerator extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Reorder & dupe buffer for chaos
  private shuffleBuffer: GeneratedFrame[] = [];

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Ping every 5 seconds
    this.pingTimer = setInterval(() => {
      this.emitPing();
    }, 5000);

    this.scheduleNextTick();
  }

  public stop() {
    this.isRunning = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.pingTimer) clearInterval(this.pingTimer);
  }

  private emitPing() {
    const ping: PingEvent = { type: 'ping', ts: Date.now() };
    const frame: GeneratedFrame = {
      type: 'ping',
      rawText: JSON.stringify(ping),
      event: ping
    };
    this.emit('frame', frame);
  }

  private scheduleNextTick() {
    if (!this.isRunning) return;

    const chaos = chaosStore.getGlobal();
    const rate = Math.min(Math.max(chaos.rate || 500, 1), 5000);

    // Group events into batches ~20ms ticks for high rate smoothness
    const tickIntervalMs = 20;
    const eventsPerTick = Math.max(1, Math.round((rate * tickIntervalMs) / 1000));

    this.timer = setTimeout(() => {
      this.generateBatch(eventsPerTick, chaos);
      this.scheduleNextTick();
    }, tickIntervalMs);
  }

  private generateBatch(count: number, chaos: ChaosState) {
    const totalServices = dataStore.services.length;
    if (totalServices === 0) return;

    const framesToEmit: GeneratedFrame[] = [];

    for (let i = 0; i < count; i++) {
      // Pick a random service
      const svcIdx = Math.floor(Math.random() * totalServices);
      const svc = dataStore.services[svcIdx];
      const prevSeq = dataStore.serviceSeq.get(svc.id) || 1000;
      const nextSeq = prevSeq + 1;
      dataStore.serviceSeq.set(svc.id, nextSeq);

      const offset = dataStore.globalOffset++;
      const now = Date.now();

      // Plausible metric oscillation
      const baseP95 = svc.status === 'down' ? 1200 : svc.status === 'degraded' ? 450 : 100;
      const p95 = Math.max(15, Math.floor(baseP95 + (Math.random() * 50 - 25)));
      const baseErr = svc.status === 'down' ? 45 : svc.status === 'degraded' ? 8.5 : 0.8;
      const errRate = +Math.max(0, Math.min(100, +(baseErr + (Math.random() * 2 - 1)).toFixed(1)));
      const rps = Math.max(10, Math.floor(1000 + (Math.random() * 600 - 300)));

      // Occasional random status flip (1 in 500 chance)
      let status: ServiceStatus = svc.status;
      if (Math.random() < 0.002) {
        status = Math.random() < 0.7 ? 'healthy' : Math.random() < 0.85 ? 'degraded' : 'down';
        svc.status = status;
      }

      const metric: MetricEvent = {
        type: 'metric',
        offset,
        serviceId: svc.id,
        seq: nextSeq,
        ts: now,
        p95,
        errRate,
        rps,
        status
      };

      // Always record in dataStore for replay buffer!
      dataStore.recordEvent(metric);

      // Check drop switch: ws=drop:<pct>
      let isDrop = false;
      if (chaos.wsDropPct && chaos.wsDropPct > 0) {
        if (Math.random() * 100 < chaos.wsDropPct) {
          isDrop = true;
        }
      }

      // Check chaos=garbage:<pct>
      let rawText = JSON.stringify(metric);
      let frameType: 'metric' | 'garbage' = 'metric';

      if (!isDrop && chaos.garbagePct && chaos.garbagePct > 0) {
        if (Math.random() * 100 < chaos.garbagePct) {
          frameType = 'garbage';
          if (Math.random() < 0.5) {
            // Malformed JSON
            rawText = `{"type":"metric","offset":${offset},"serviceId":"${svc.id}", bad_json: unclosed`;
          } else {
            // Missing required fields (missing serviceId, status, p95)
            rawText = JSON.stringify({ type: 'metric', offset, ts: now });
          }
        }
      }

      const frame: GeneratedFrame = {
        type: frameType,
        rawText,
        event: frameType === 'metric' ? metric : undefined,
        offset,
        isDrop
      };

      if (!isDrop) {
        framesToEmit.push(frame);

        // Check chaos=dupe (~10% delivered twice)
        if (chaos.dupe && Math.random() < 0.1) {
          // Send duplicate shortly
          framesToEmit.push({ ...frame });
        }
      }
    }

    // Check chaos=shuffle (reorder up to 1 second)
    if (chaos.shuffle) {
      this.shuffleBuffer.push(...framesToEmit);
      if (this.shuffleBuffer.length > 50) {
        // Shuffle random items
        const toReleaseCount = Math.floor(this.shuffleBuffer.length * 0.4);
        for (let j = 0; j < toReleaseCount; j++) {
          const randIdx = Math.floor(Math.random() * this.shuffleBuffer.length);
          const [f] = this.shuffleBuffer.splice(randIdx, 1);
          this.emit('frame', f);
        }
      }
    } else {
      // Flush shuffle buffer if shuffle was turned off
      if (this.shuffleBuffer.length > 0) {
        for (const f of this.shuffleBuffer) {
          this.emit('frame', f);
        }
        this.shuffleBuffer = [];
      }
      for (const f of framesToEmit) {
        this.emit('frame', f);
      }
    }
  }
}

export const eventGenerator = new EventGenerator();
