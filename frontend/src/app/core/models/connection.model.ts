export type TransportType = 'websocket' | 'sse' | 'polling';

export type TransportStatus =
  | 'live_ws'
  | 'live_sse'
  | 'polling'
  | 'reconnecting'
  | 'offline'
  | 'stale';

export interface TransportState {
  type: TransportType;
  status: TransportStatus;
  reconnectInSec?: number;
  lastEventTs?: number;
  staleSec?: number;
  consecutiveFailures: number;
}
