import { Observable } from 'rxjs';
import { TransportType } from '../../models/connection.model.js';

export interface StreamTransport {
  readonly type: TransportType;
  connect(token: string): Observable<string>;
  disconnect(): void;
  isConnected(): boolean;
}
