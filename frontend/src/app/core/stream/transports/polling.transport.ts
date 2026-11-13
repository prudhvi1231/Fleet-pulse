import { Observable, Subject } from 'rxjs';
import { StreamTransport } from './stream-transport.interface.js';
import { TransportType } from '../../models/connection.model.js';
import { APP_CONFIG } from '../../config/app-config.js';
import { MetricsSnapshotResponse } from '../../models/service.model.js';

export class PollingTransport implements StreamTransport {
  public readonly type: TransportType = 'polling';
  private messageSubject = new Subject<string>();
  private pollTimer: any = null;
  private connected = false;

  connect(token: string): Observable<string> {
    this.disconnect();
    this.messageSubject = new Subject<string>();
    this.connected = true;

    const pollOnce = async () => {
      if (!this.connected) return;
      try {
        const response = await fetch(`${APP_CONFIG.apiBaseUrl}/metrics/snapshot`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error(`Polling snapshot failed with status ${response.status}`);
        }

        const data: MetricsSnapshotResponse = await response.json();
        // Emit snapshot events individually so downstream pipeline consumes standard stream
        if (Array.isArray(data.metrics)) {
          for (const metric of data.metrics) {
            this.messageSubject.next(JSON.stringify(metric));
          }
        }
      } catch (err) {
        this.messageSubject.error(err);
      }
    };

    // Immediate first poll, then interval
    pollOnce();
    this.pollTimer = setInterval(pollOnce, APP_CONFIG.pollingIntervalMs);

    return this.messageSubject.asObservable();
  }

  disconnect(): void {
    this.connected = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
