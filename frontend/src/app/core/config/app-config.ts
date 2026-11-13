export const APP_CONFIG = {
  apiBaseUrl: 'http://localhost:4000',
  secondaryApiBaseUrl: 'http://localhost:4001',
  wsUrl: 'ws://localhost:4000/stream',
  sseUrl: 'http://localhost:4000/stream/sse',

  // HTTP Resilience
  httpTimeoutMs: 10000,
  maxHttpRetries: 3,

  // Stream Transport & Fallback
  wsConnectTimeoutMs: 5000,
  maxTransportFailures: 3,
  climbBackIntervalMs: 30000,
  reconnectBaseDelayMs: 1000,
  reconnectMaxDelayMs: 30000,
  pollingIntervalMs: 2000,

  // Stream Data Integrity
  heartbeatIntervalMs: 5000,
  missedPingsLimit: 2, // 10s total
  staleDataThresholdMs: 10000,
  reorderWindowMs: 1000,
  dedupeHistorySize: 5000,

  // High Throughput & UI Batching
  batchFlushIntervalMs: 50, // Micro-batching for 2,000 events/sec

  // Charts
  maxChartPoints: 300,
  historyWindowMinutes: 15,
};
