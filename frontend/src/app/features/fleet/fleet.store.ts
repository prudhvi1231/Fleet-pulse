import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Service, MetricEvent } from '../../core/models/service.model.js';
import { APP_CONFIG } from '../../core/config/app-config.js';
import { StreamBatcherService } from '../../core/stream/stream-batcher.service.js';

export interface ServiceTableRow extends Service {
  p95: number;
  errRate: number;
  rps: number;
  lastUpdated: number;
}

@Injectable({
  providedIn: 'root'
})
export class FleetStore {
  private http = inject(HttpClient);
  private router = inject(Router);
  private batcher = inject(StreamBatcherService);

  // Raw services and metric map
  private rawServices = signal<Service[]>([]);
  private metricsMap = signal<Map<string, MetricEvent>>(new Map());

  // URL-driven query state
  public readonly searchQuery = signal<string>('');
  public readonly statusFilter = signal<string>('all'); // 'all' | 'healthy' | 'degraded' | 'down'
  public readonly sortColumn = signal<string>('id');
  public readonly sortDirection = signal<'asc' | 'desc'>('asc');
  public readonly isLoading = signal<boolean>(true);

  private batchSub: Subscription | null = null;

  // Computed combined table rows (2,000 services with latest live metrics)
  public readonly allRows = computed<ServiceTableRow[]>(() => {
    const services = this.rawServices();
    const metrics = this.metricsMap();

    return services.map((svc) => {
      const m = metrics.get(svc.id);
      return {
        ...svc,
        status: m?.status || svc.status,
        p95: m?.p95 ?? 0,
        errRate: m?.errRate ?? 0,
        rps: m?.rps ?? 0,
        lastUpdated: m?.ts ?? 0
      };
    });
  });

  // Filtered and sorted rows for virtual scrolling
  public readonly filteredAndSortedRows = computed<ServiceTableRow[]>(() => {
    const rows = this.allRows();
    const query = this.searchQuery().toLowerCase().trim();
    const status = this.statusFilter();
    const sortCol = this.sortColumn();
    const sortDir = this.sortDirection();

    let result = rows;

    // Filter by search
    if (query) {
      result = result.filter(
        (r) =>
          r.id.toLowerCase().includes(query) ||
          r.name.toLowerCase().includes(query) ||
          r.team.toLowerCase().includes(query)
      );
    }

    // Filter by status
    if (status !== 'all') {
      result = result.filter((r) => r.status === status);
    }

    // Sort
    result = [...result].sort((a, b) => {
      let valA: any = (a as any)[sortCol];
      let valB: any = (b as any)[sortCol];

      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB);
        return sortDir === 'asc' ? cmp : -cmp;
      }

      valA = valA ?? 0;
      valB = valB ?? 0;
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });

    return result;
  });

  public init() {
    this.batcher.init();
    this.loadInitialServices();

    // Subscribe to batched live updates
    this.batchSub = this.batcher.batchedMetrics$.subscribe((batch) => {
      this.metricsMap.update((current) => {
        const next = new Map(current);
        for (const [id, metric] of batch.entries()) {
          next.set(id, metric);
        }
        return next;
      });
    });
  }

  public destroy() {
    if (this.batchSub) this.batchSub.unsubscribe();
    this.batcher.destroy();
  }

  public loadInitialServices() {
    this.isLoading.set(true);
    this.http.get<Service[]>(`${APP_CONFIG.apiBaseUrl}/services`).subscribe({
      next: (services) => {
        this.rawServices.set(services);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }

  // URL Sync
  public syncFromUrlParams(params: Record<string, any>) {
    if (params['q'] !== undefined) this.searchQuery.set(params['q']);
    if (params['status'] !== undefined) this.statusFilter.set(params['status']);
    if (params['sort'] !== undefined) this.sortColumn.set(params['sort']);
    if (params['dir'] !== undefined) this.sortDirection.set(params['dir'] as 'asc' | 'desc');
  }

  public updateQueryParams() {
    this.router.navigate([], {
      queryParams: {
        q: this.searchQuery() || null,
        status: this.statusFilter() !== 'all' ? this.statusFilter() : null,
        sort: this.sortColumn() !== 'id' ? this.sortColumn() : null,
        dir: this.sortDirection() !== 'asc' ? this.sortDirection() : null
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  public setSort(column: string) {
    if (this.sortColumn() === column) {
      this.sortDirection.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
    this.updateQueryParams();
  }

  public setSearch(query: string) {
    this.searchQuery.set(query);
    this.updateQueryParams();
  }

  public setStatus(status: string) {
    this.statusFilter.set(status);
    this.updateQueryParams();
  }
}
