import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, Subscription } from 'rxjs';
import { MetricEvent, MetricsSnapshotResponse, MetricsReplayResponse } from '../models/service.model.js';
import { APP_CONFIG } from '../config/app-config.js';
import { TransportCoordinatorService } from './transport-coordinator.service.js';

@Injectable({
  providedIn: 'root'
})
export class StreamPipelineService {
  private coordinator = inject(TransportCoordinatorService);
  private http = inject(HttpClient);

  // Output observable of validated, ordered MetricEvents
  private metricEventsSubject = new Subject<MetricEvent>();
  public readonly metricEvents$: Observable<MetricEvent> = this.metricEventsSubject.asObservable();

  // Reactive counters & health signals
  public readonly malformedEventCount = signal<number>(0);
  public readonly duplicateEventCount = signal<number>(0);
  public readonly gapReplayCount = signal<number>(0);
  public readonly lastEventTimestamp = signal<number>(Date.now());
  public readonly staleDurationSec = signal<number>(0);
  public readonly isStale = signal<boolean>(false);

  // State tracking
  private lastGlobalOffset: number = 0;
  private seenOffsets = new Set<number>();
  private seenOffsetsQueue: number[] = [];
  private readonly maxSeenOffsets = APP_CONFIG.dedupeHistorySize;

  // Reorder buffer (1-second sliding buffer for out-of-order arrivals)
  private reorderBuffer: MetricEvent[] = [];
  private reorderFlushTimer: any = null;

  // Heartbeat & stale monitors
  private lastHeartbeatTs: number = Date.now();
  private heartbeatCheckTimer: any = null;
  private staleTimer: any = null;

  private isReplaying = false;
  private rawFramesSub: Subscription | null = null;

  constructor() {
    this.startHeartbeatMonitor();
    this.startStaleTimer();
  }

  public init() {
    this.coordinator.start();
    this.rawFramesSub = this.coordinator.rawFrames$.subscribe((frame) => {
      this.processRawFrame(frame);
    });
  }

  public destroy() {
    if (this.rawFramesSub) this.rawFramesSub.unsubscribe();
    if (this.heartbeatCheckTimer) clearInterval(this.heartbeatCheckTimer);
    if (this.staleTimer) clearInterval(this.staleTimer);
    if (this.reorderFlushTimer) clearInterval(this.reorderFlushTimer);
    this.coordinator.stop();
  }

  // R1.5: 2 missed pings in a row (10s) means dead connection
  private startHeartbeatMonitor() {
    this.lastHeartbeatTs = Date.now();
    this.heartbeatCheckTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastHeartbeatTs;
      if (elapsed > APP_CONFIG.heartbeatIntervalMs * APP_CONFIG.missedPingsLimit) {
        console.warn(`[Pipeline] Two missed pings detected (${elapsed}ms since last activity). Forcing reconnect.`);
        this.lastHeartbeatTs = Date.now();
        this.coordinator.forceReconnect();
      }
    }, 2000);
  }

  // E2: Stale data timer (data older than 10s is marked stale)
  private startStaleTimer() {
    this.staleTimer = setInterval(() => {
      const elapsedMs = Date.now() - this.lastEventTimestamp();
      const sec = Math.floor(elapsedMs / 1000);
      this.staleDurationSec.set(sec);
      this.isStale.set(elapsedMs > APP_CONFIG.staleDataThresholdMs);
    }, 1000);
  }

  private processRawFrame(raw: string) {
    this.lastHeartbeatTs = Date.now();
    this.lastEventTimestamp.set(Date.now());
    this.isStale.set(false);

    // R2.4: Malformed event protection
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.malformedEventCount.update((c) => c + 1);
      return;
    }

    if (!parsed || typeof parsed !== 'object') {
      this.malformedEventCount.update((c) => c + 1);
      return;
    }

    // Ping event
    if (parsed.type === 'ping') {
      return;
    }

    // Metric event validation
    if (
      parsed.type !== 'metric' ||
      typeof parsed.offset !== 'number' ||
      !parsed.serviceId ||
      typeof parsed.seq !== 'number' ||
      typeof parsed.p95 !== 'number' ||
      typeof parsed.errRate !== 'number' ||
      typeof parsed.rps !== 'number' ||
      !parsed.status
    ) {
      this.malformedEventCount.update((c) => c + 1);
      return;
    }

    const event = parsed as MetricEvent;

    // R2.2: Duplicate drop
    if (this.seenOffsets.has(event.offset)) {
      this.duplicateEventCount.update((c) => c + 1);
      return;
    }

    this.recordSeenOffset(event.offset);

    // R2.3: Gap detection
    if (this.lastGlobalOffset > 0 && event.offset > this.lastGlobalOffset + 1 && !this.isReplaying) {
      console.warn(`[Pipeline] Gap detected! Expected ${this.lastGlobalOffset + 1}, got ${event.offset}`);
      this.recoverGap(this.lastGlobalOffset);
    }

    // R2.2: Out-of-order 1s reorder buffer
    this.enqueueReorder(event);
  }

  private recordSeenOffset(offset: number) {
    this.seenOffsets.add(offset);
    this.seenOffsetsQueue.push(offset);
    if (this.seenOffsetsQueue.length > this.maxSeenOffsets) {
      const removed = this.seenOffsetsQueue.shift();
      if (removed !== undefined) this.seenOffsets.delete(removed);
    }
  }

  private enqueueReorder(event: MetricEvent) {
    this.reorderBuffer.push(event);

    if (!this.reorderFlushTimer) {
      // Flush every 50ms (or up to 1000ms max age)
      this.reorderFlushTimer = setTimeout(() => {
        this.flushReorderBuffer();
      }, 50);
    }
  }

  private flushReorderBuffer() {
    this.reorderFlushTimer = null;
    if (this.reorderBuffer.length === 0) return;

    // Sort by global offset to preserve absolute order
    this.reorderBuffer.sort((a, b) => a.offset - b.offset);

    const now = Date.now();
    const readyEvents: MetricEvent[] = [];
    const remaining: MetricEvent[] = [];

    for (const ev of this.reorderBuffer) {
      // If event offset is next expected, or if it has waited > 200ms
      if (this.lastGlobalOffset === 0 || ev.offset <= this.lastGlobalOffset + 1 || now - ev.ts > 200) {
        readyEvents.push(ev);
        if (ev.offset > this.lastGlobalOffset) {
          this.lastGlobalOffset = ev.offset;
        }
      } else {
        remaining.push(ev);
      }
    }

    this.reorderBuffer = remaining;

    for (const ev of readyEvents) {
      this.metricEventsSubject.next(ev);
    }

    if (this.reorderBuffer.length > 0) {
      this.reorderFlushTimer = setTimeout(() => this.flushReorderBuffer(), 50);
    }
  }

  // R2.3: Gap recovery via /metrics/replay or full snapshot
  private recoverGap(sinceOffset: number) {
    this.isReplaying = true;
    this.gapReplayCount.update((c) => c + 1);

    this.http.get<MetricsReplayResponse>(`${APP_CONFIG.apiBaseUrl}/metrics/replay?since=${sinceOffset}`).subscribe({
      next: (res) => {
        this.isReplaying = false;
        if (Array.isArray(res.events)) {
          for (const ev of res.events) {
            if (!this.seenOffsets.has(ev.offset)) {
              this.recordSeenOffset(ev.offset);
              this.enqueueReorder(ev);
            }
          }
        }
      },
      error: (err) => {
        this.isReplaying = false;
        // If 410 replay_too_old, reload full snapshot
        if (err.status === 410) {
          console.warn('[Pipeline] Replay window expired (410). Reloading complete snapshot.');
          this.reloadFullSnapshot();
        }
      }
    });
  }

  public reloadFullSnapshot() {
    this.http.get<MetricsSnapshotResponse>(`${APP_CONFIG.apiBaseUrl}/metrics/snapshot`).subscribe({
      next: (snap) => {
        this.lastGlobalOffset = snap.offset;
        if (Array.isArray(snap.metrics)) {
          for (const metric of snap.metrics) {
            this.seenOffsets.add(metric.offset);
            this.metricEventsSubject.next(metric);
          }
        }
      }
    });
  }
}
