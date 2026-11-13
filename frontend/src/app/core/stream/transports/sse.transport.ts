import { Observable, Subject } from 'rxjs';
import { StreamTransport } from './stream-transport.interface.js';
import { TransportType } from '../../models/connection.model.js';
import { APP_CONFIG } from '../../config/app-config.js';

export class SseTransport implements StreamTransport {
  public readonly type: TransportType = 'sse';
  private eventSource: EventSource | null = null;
  private messageSubject = new Subject<string>();
  private connected = false;

  connect(token: string): Observable<string> {
    this.disconnect();
    this.messageSubject = new Subject<string>();

    const url = `${APP_CONFIG.sseUrl}?access_token=${encodeURIComponent(token)}`;

    try {
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        this.connected = true;
      };

      this.eventSource.addEventListener('metric', (event: MessageEvent) => {
        this.messageSubject.next(event.data);
      });

      this.eventSource.addEventListener('ping', (event: MessageEvent) => {
        this.messageSubject.next(event.data);
      });

      this.eventSource.onerror = (err: Event) => {
        this.connected = false;
        this.messageSubject.error(err);
      };
    } catch (e) {
      this.connected = false;
      this.messageSubject.error(e);
    }

    return this.messageSubject.asObservable();
  }

  disconnect(): void {
    this.connected = false;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  isConnected(): boolean {
    return this.connected && this.eventSource?.readyState === EventSource.OPEN;
  }
}
