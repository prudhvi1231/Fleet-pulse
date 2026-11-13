import { Observable, Subject } from 'rxjs';
import { StreamTransport } from './stream-transport.interface.js';
import { TransportType } from '../../models/connection.model.js';
import { APP_CONFIG } from '../../config/app-config.js';

export class WebSocketTransport implements StreamTransport {
  public readonly type: TransportType = 'websocket';
  private socket: WebSocket | null = null;
  private messageSubject = new Subject<string>();
  private connected = false;
  private connectionTimeoutTimer: any = null;

  connect(token: string): Observable<string> {
    this.disconnect();
    this.messageSubject = new Subject<string>();

    const url = `${APP_CONFIG.wsUrl}?access_token=${encodeURIComponent(token)}`;

    try {
      this.socket = new WebSocket(url);

      // Connect timeout check (5 seconds as required by R1)
      this.connectionTimeoutTimer = setTimeout(() => {
        if (!this.connected) {
          this.disconnect();
          this.messageSubject.error(new Error('WebSocket connection timed out after 5s'));
        }
      }, APP_CONFIG.wsConnectTimeoutMs);

      this.socket.onopen = () => {
        if (this.connectionTimeoutTimer) {
          clearTimeout(this.connectionTimeoutTimer);
          this.connectionTimeoutTimer = null;
        }
        this.connected = true;
      };

      this.socket.onmessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          this.messageSubject.next(event.data);
        }
      };

      this.socket.onerror = (err: Event) => {
        this.connected = false;
        this.messageSubject.error(err);
      };

      this.socket.onclose = (event: CloseEvent) => {
        this.connected = false;
        if (event.code === 4401) {
          this.messageSubject.error(new Error('WebSocket 4401 Unauthorized'));
        } else if (event.code !== 1000) {
          this.messageSubject.error(new Error(`WebSocket closed with code ${event.code}`));
        } else {
          this.messageSubject.complete();
        }
      };
    } catch (e) {
      this.connected = false;
      this.messageSubject.error(e);
    }

    return this.messageSubject.asObservable();
  }

  disconnect(): void {
    if (this.connectionTimeoutTimer) {
      clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = null;
    }
    this.connected = false;
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.connected && this.socket?.readyState === WebSocket.OPEN;
  }
}
