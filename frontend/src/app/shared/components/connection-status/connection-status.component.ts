import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransportCoordinatorService } from '../../../core/stream/transport-coordinator.service.js';
import { StreamPipelineService } from '../../../core/stream/stream-pipeline.service.js';

@Component({
  selector: 'app-connection-status',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="connection-status-container" role="status" aria-live="polite">
      <!-- Connection Badge -->
      <div class="status-indicator" [ngClass]="statusClass">
        <span class="status-dot"></span>
        <span class="status-label">{{ statusText }}</span>
      </div>

      <!-- Chaos & Telemetry Counters -->
      <div class="stream-telemetry">
        <span class="badge" title="Dropped duplicates safely filtered out">
          Dupes: {{ pipeline.duplicateEventCount() }}
        </span>
        <span class="badge" title="Malformed or corrupt frames intercepted without crash">
          Corrupt: {{ pipeline.malformedEventCount() }}
        </span>
        <span class="badge" title="Offset gaps filled via replay recovery">
          Replays: {{ pipeline.gapReplayCount() }}
        </span>
      </div>
    </div>
  `,
  styles: [`
    .connection-status-container {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
      transition: background-color 0.2s, color 0.2s;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: currentColor;
    }

    /* Live WS */
    .status-live-ws {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .status-live-ws .status-dot {
      animation: pulse-dot 1.8s infinite;
    }

    /* Live SSE */
    .status-live-sse {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .status-live-sse .status-dot {
      animation: pulse-dot 1.8s infinite;
    }

    /* Polling */
    .status-polling {
      background: rgba(234, 179, 8, 0.15);
      color: #facc15;
      border: 1px solid rgba(234, 179, 8, 0.3);
    }

    /* Reconnecting */
    .status-reconnecting {
      background: rgba(249, 115, 22, 0.15);
      color: #fb923c;
      border: 1px solid rgba(249, 115, 22, 0.3);
    }

    /* Offline */
    .status-offline {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    /* Stale */
    .status-stale {
      background: rgba(217, 119, 6, 0.2);
      color: #fbbf24;
      border: 1px solid rgba(217, 119, 6, 0.4);
    }

    @keyframes pulse-dot {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
      100% { opacity: 1; transform: scale(1); }
    }

    .stream-telemetry {
      display: flex;
      gap: 6px;
    }

    .badge {
      font-size: 11px;
      font-family: monospace;
      padding: 2px 7px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-muted, #94a3b8);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
  `]
})
export class ConnectionStatusComponent {
  public coordinator = inject(TransportCoordinatorService);
  public pipeline = inject(StreamPipelineService);

  get statusText(): string {
    if (this.coordinator.connectionStatus() === 'offline') {
      return 'Offline';
    }

    if (this.pipeline.isStale()) {
      return `Stale: last event ${this.pipeline.staleDurationSec()} s ago`;
    }

    const reconnectSec = this.coordinator.reconnectCountdownSec();
    if (reconnectSec !== null && reconnectSec > 0) {
      return `Reconnecting in ${reconnectSec} s`;
    }

    switch (this.coordinator.connectionStatus()) {
      case 'live_ws': return 'Live (WebSocket)';
      case 'live_sse': return 'Live (SSE)';
      case 'polling': return 'Polling';
      default: return 'Reconnecting...';
    }
  }

  get statusClass(): string {
    if (this.coordinator.connectionStatus() === 'offline') {
      return 'status-offline';
    }
    if (this.pipeline.isStale()) {
      return 'status-stale';
    }
    const reconnectSec = this.coordinator.reconnectCountdownSec();
    if (reconnectSec !== null && reconnectSec > 0) {
      return 'status-reconnecting';
    }
    switch (this.coordinator.connectionStatus()) {
      case 'live_ws': return 'status-live-ws';
      case 'live_sse': return 'status-live-sse';
      case 'polling': return 'status-polling';
      default: return 'status-reconnecting';
    }
  }
}
