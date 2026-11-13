import { Injectable, signal, inject } from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';
import { StreamTransport } from './transports/stream-transport.interface.js';
import { WebSocketTransport } from './transports/websocket.transport.js';
import { SseTransport } from './transports/sse.transport.js';
import { PollingTransport } from './transports/polling.transport.js';
import { TransportType, TransportStatus } from '../models/connection.model.js';
import { APP_CONFIG } from '../config/app-config.js';
import { AuthService } from '../auth/auth.service.js';

@Injectable({
  providedIn: 'root'
})
export class TransportCoordinatorService {
  private authService = inject(AuthService);

  private wsTransport = new WebSocketTransport();
  private sseTransport = new SseTransport();
  private pollingTransport = new PollingTransport();

  private activeTransport: StreamTransport = this.wsTransport;
  private transportSubscription: Subscription | null = null;
  private climbBackTimer: any = null;
  private reconnectTimer: any = null;
  private countdownTimer: any = null;

  private isOffline = false;
  private consecutiveFailures = 0;

  // Reactive state signals
  public readonly currentTransportType = signal<TransportType>('websocket');
  public readonly connectionStatus = signal<TransportStatus>('reconnecting');
  public readonly reconnectCountdownSec = signal<number | null>(null);

  // Observable of raw string frames delivered from current active transport
  private rawFramesSubject = new Subject<string>();
  public readonly rawFrames$: Observable<string> = this.rawFramesSubject.asObservable();

  constructor() {
    this.setupNetworkListeners();
  }

  private setupNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('offline', () => {
        this.isOffline = true;
        this.connectionStatus.set('offline');
        this.clearReconnectTimers();
        this.activeTransport.disconnect();
      });

      window.addEventListener('online', () => {
        this.isOffline = false;
        // Reconnect immediately when back online
        this.consecutiveFailures = 0;
        this.connect();
      });
    }
  }

  public start() {
    this.connect();
    this.startClimbBackLoop();
  }

  public stop() {
    this.clearReconnectTimers();
    if (this.climbBackTimer) clearInterval(this.climbBackTimer);
    if (this.transportSubscription) this.transportSubscription.unsubscribe();
    this.activeTransport.disconnect();
  }

  private connect() {
    if (this.isOffline) {
      this.connectionStatus.set('offline');
      return;
    }

    const token = this.authService.accessToken();
    if (!token) return;

    this.clearReconnectTimers();
    if (this.transportSubscription) {
      this.transportSubscription.unsubscribe();
      this.transportSubscription = null;
    }

    this.activeTransport.disconnect();

    this.transportSubscription = this.activeTransport.connect(token).subscribe({
      next: (frame: string) => {
        // Successful message receipt resets consecutive failures
        if (this.consecutiveFailures > 0) {
          this.consecutiveFailures = 0;
        }
        this.updateStatusForActiveTransport();
        this.rawFramesSubject.next(frame);
      },
      error: () => {
        this.handleTransportFailure();
      },
      complete: () => {
        this.handleTransportFailure();
      }
    });
  }

  private handleTransportFailure() {
    if (this.isOffline) return;

    this.consecutiveFailures++;

    // Determine fallback
    if (this.activeTransport.type === 'websocket' && this.consecutiveFailures >= APP_CONFIG.maxTransportFailures) {
      console.warn('[Transport] WebSocket failed 3 times, falling back to SSE');
      this.activeTransport = this.sseTransport;
      this.currentTransportType.set('sse');
      this.consecutiveFailures = 0;
      this.connect();
      return;
    } else if (this.activeTransport.type === 'sse' && this.consecutiveFailures >= APP_CONFIG.maxTransportFailures) {
      console.warn('[Transport] SSE failed 3 times, falling back to Polling');
      this.activeTransport = this.pollingTransport;
      this.currentTransportType.set('polling');
      this.consecutiveFailures = 0;
      this.connect();
      return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    this.clearReconnectTimers();

    // Exponential backoff with random jitter up to 30s cap
    const base = APP_CONFIG.reconnectBaseDelayMs;
    const exponential = Math.min(base * Math.pow(1.5, this.consecutiveFailures), APP_CONFIG.reconnectMaxDelayMs);
    const jitter = Math.floor(Math.random() * 1000); // 0 to 1s jitter to avoid lockstep
    const totalDelayMs = Math.min(exponential + jitter, APP_CONFIG.reconnectMaxDelayMs);

    let remainingSec = Math.ceil(totalDelayMs / 1000);
    this.reconnectCountdownSec.set(remainingSec);
    this.connectionStatus.set('reconnecting');

    this.countdownTimer = setInterval(() => {
      remainingSec--;
      if (remainingSec > 0) {
        this.reconnectCountdownSec.set(remainingSec);
      } else {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.reconnectCountdownSec.set(null);
      }
    }, 1000);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectCountdownSec.set(null);
      this.connect();
    }, totalDelayMs);
  }

  private clearReconnectTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.reconnectCountdownSec.set(null);
  }

  // R1.3: Climb back loop: try higher transport every 30s
  private startClimbBackLoop() {
    if (this.climbBackTimer) clearInterval(this.climbBackTimer);

    this.climbBackTimer = setInterval(() => {
      if (this.isOffline) return;

      const token = this.authService.accessToken();
      if (!token) return;

      if (this.activeTransport.type === 'polling') {
        // Try climbing to SSE or WS
        this.probeAndClimb(this.wsTransport);
      } else if (this.activeTransport.type === 'sse') {
        // Try climbing to WS
        this.probeAndClimb(this.wsTransport);
      }
    }, APP_CONFIG.climbBackIntervalMs);
  }

  private probeAndClimb(targetTransport: StreamTransport) {
    const token = this.authService.accessToken();
    if (!token) return;

    let probeSub: Subscription | null = null;
    const probe = targetTransport.connect(token);

    probeSub = probe.subscribe({
      next: () => {
        // Successfully connected to higher transport!
        console.log(`[Transport] Successfully climbed back up to ${targetTransport.type}`);
        probeSub?.unsubscribe();
        this.activeTransport = targetTransport;
        this.currentTransportType.set(targetTransport.type);
        this.consecutiveFailures = 0;
        this.connect();
      },
      error: () => {
        probeSub?.unsubscribe();
        targetTransport.disconnect();
      }
    });

    // Timeout probe after 4s
    setTimeout(() => {
      if (probeSub && !probeSub.closed) {
        probeSub.unsubscribe();
        targetTransport.disconnect();
      }
    }, 4000);
  }

  private updateStatusForActiveTransport() {
    if (this.activeTransport.type === 'websocket') {
      this.connectionStatus.set('live_ws');
    } else if (this.activeTransport.type === 'sse') {
      this.connectionStatus.set('live_sse');
    } else {
      this.connectionStatus.set('polling');
    }
  }

  public forceReconnect() {
    this.consecutiveFailures = 0;
    this.connect();
  }
}
