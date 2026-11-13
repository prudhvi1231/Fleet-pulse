import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription, switchMap, tap } from 'rxjs';
import { HistoryPoint, ServiceHistoryResponse, MetricEvent } from '../../core/models/service.model.js';
import { APP_CONFIG } from '../../core/config/app-config.js';
import { StreamPipelineService } from '../../core/stream/stream-pipeline.service.js';
import { MetricChartComponent } from './metric-chart.component.js';
import { lttbDownsample } from './chart-data-reducer.js';

@Component({
  selector: 'app-service-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, MetricChartComponent],
  template: `
    <div class="service-detail-container" [class.is-stale]="pipeline.isStale()">
      <div class="detail-header">
        <a routerLink="/" class="back-link">&larr; Back to Fleet</a>
        <div class="header-main">
          <div class="title-section">
            <h1 class="service-title">{{ serviceId() }}</h1>
            <span class="history-badge">Last 15 minutes history + Live stream</span>
          </div>
          <div class="quick-nav">
            <button class="nav-btn" (click)="switchService('prev')">&larr; Previous Svc</button>
            <button class="nav-btn" (click)="switchService('next')">Next Svc &rarr;</button>
          </div>
        </div>
      </div>

      @if (isLoading()) {
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Loading 15 minutes metrics history for {{ serviceId() }}...</p>
        </div>
      } @else {
        <div class="charts-grid">
          <!-- 1. Latency Chart -->
          <app-metric-chart
            title="p95 Latency"
            unit="ms"
            metricKey="p95"
            color="#8b5cf6"
            [points]="downsampledPoints()"
          ></app-metric-chart>

          <!-- 2. Error Rate Chart -->
          <app-metric-chart
            title="Error Rate"
            unit="%"
            metricKey="errRate"
            color="#ef4444"
            [points]="downsampledPoints()"
          ></app-metric-chart>

          <!-- 3. Requests Per Second Chart -->
          <app-metric-chart
            title="Throughput (RPS)"
            unit="req/s"
            metricKey="rps"
            color="#10b981"
            [points]="downsampledPoints()"
          ></app-metric-chart>
        </div>
      }
    </div>
  `,
  styles: [`
    .service-detail-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .service-detail-container.is-stale {
      opacity: 0.78;
    }

    .detail-header {
      background: var(--bg-card, #1e222d);
      border: 1px solid var(--border-color, #2a2e39);
      border-radius: 8px;
      padding: 16px 20px;
    }

    .back-link {
      display: inline-block;
      color: #60a5fa;
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 8px;
    }

    .back-link:hover {
      text-decoration: underline;
    }

    .header-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .service-title {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary, #ffffff);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .history-badge {
      display: inline-block;
      margin-top: 4px;
      font-size: 12px;
      color: var(--text-muted, #94a3b8);
    }

    .quick-nav {
      display: flex;
      gap: 10px;
    }

    .nav-btn {
      padding: 6px 12px;
      font-size: 12px;
      background: var(--bg-input, #12141a);
      border: 1px solid var(--border-color, #363c4e);
      color: var(--text-primary, #e1e4ea);
      border-radius: 6px;
      cursor: pointer;
      transition: background-color 0.15s;
    }

    .nav-btn:hover {
      background: var(--bg-hover, #232736);
    }

    .charts-grid {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .loading-state {
      padding: 60px;
      text-align: center;
      color: var(--text-muted, #94a3b8);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(59, 130, 246, 0.2);
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class ServiceDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  public pipeline = inject(StreamPipelineService);

  public serviceId = signal<string>('');
  public isLoading = signal<boolean>(true);
  public rawPoints = signal<HistoryPoint[]>([]);

  // Downsample to max 300 points per series
  public downsampledPoints = signal<HistoryPoint[]>([]);

  private routeSub: Subscription | null = null;
  private streamSub: Subscription | null = null;

  ngOnInit(): void {
    // R3: Fast switching race guard:
    // switchMap cancels prior HTTP requests, and we clear local points immediately on route change!
    this.routeSub = this.route.paramMap
      .pipe(
        tap((params) => {
          const id = params.get('id') || '';
          this.serviceId.set(id);
          // Fast switching guard: clear buffer immediately so prior service data never shows!
          this.rawPoints.set([]);
          this.downsampledPoints.set([]);
          this.isLoading.set(true);
        }),
        switchMap((params) => {
          const id = params.get('id') || '';
          return this.http.get<ServiceHistoryResponse>(
            `${APP_CONFIG.apiBaseUrl}/metrics/history?serviceId=${id}&minutes=${APP_CONFIG.historyWindowMinutes}`
          );
        })
      )
      .subscribe({
        next: (res) => {
          this.rawPoints.set(res.points || []);
          this.updateDownsampled();
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        }
      });

    // Listen to live stream points for this service
    this.streamSub = this.pipeline.metricEvents$.subscribe((event: MetricEvent) => {
      if (event.serviceId === this.serviceId()) {
        const newPoint: HistoryPoint = {
          ts: event.ts,
          p95: event.p95,
          errRate: event.errRate,
          rps: event.rps
        };

        this.rawPoints.update((pts) => {
          const updated = [...pts, newPoint];
          // Keep at most 900 raw points (15 min at 1 sec)
          if (updated.length > 900) {
            updated.shift();
          }
          return updated;
        });

        this.updateDownsampled();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.routeSub) this.routeSub.unsubscribe();
    if (this.streamSub) this.streamSub.unsubscribe();
  }

  private updateDownsampled(): void {
    const raw = this.rawPoints();
    const reduced = lttbDownsample(raw, APP_CONFIG.maxChartPoints);
    this.downsampledPoints.set(reduced);
  }

  switchService(direction: 'prev' | 'next'): void {
    const current = this.serviceId();
    const num = parseInt(current.replace('svc-', ''), 10) || 1;
    const nextNum = direction === 'next' ? (num >= 2000 ? 1 : num + 1) : (num <= 1 ? 2000 : num - 1);
    const nextId = `svc-${String(nextNum).padStart(4, '0')}`;
    window.location.hash = `#/services/${nextId}`;
  }
}
