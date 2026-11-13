import { Injectable, inject } from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';
import { MetricEvent } from '../models/service.model.js';
import { StreamPipelineService } from './stream-pipeline.service.js';
import { APP_CONFIG } from '../config/app-config.js';

@Injectable({
  providedIn: 'root'
})
export class StreamBatcherService {
  private pipeline = inject(StreamPipelineService);

  private pendingBatch = new Map<string, MetricEvent>();
  private batchSubject = new Subject<Map<string, MetricEvent>>();
  public readonly batchedMetrics$: Observable<Map<string, MetricEvent>> = this.batchSubject.asObservable();

  private isScheduled = false;
  private pipelineSub: Subscription | null = null;

  public init() {
    this.pipeline.init();
    this.pipelineSub = this.pipeline.metricEvents$.subscribe((event) => {
      this.pendingBatch.set(event.serviceId, event);
      this.scheduleFlush();
    });
  }

  public destroy() {
    if (this.pipelineSub) this.pipelineSub.unsubscribe();
    this.pipeline.destroy();
  }

  private scheduleFlush() {
    if (this.isScheduled) return;
    this.isScheduled = true;

    // Flush batch on next animation frame or ~30-50ms tick
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => this.flush());
    } else {
      setTimeout(() => this.flush(), APP_CONFIG.batchFlushIntervalMs);
    }
  }

  private flush() {
    this.isScheduled = false;
    if (this.pendingBatch.size === 0) return;

    const toEmit = new Map(this.pendingBatch);
    this.pendingBatch.clear();
    this.batchSubject.next(toEmit);
  }
}
