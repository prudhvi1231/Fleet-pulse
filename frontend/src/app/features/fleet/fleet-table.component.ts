import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { FleetStore, ServiceTableRow } from './fleet.store.js';
import { FlashChangeDirective } from '../../shared/directives/flash-change.directive.js';
import { StreamPipelineService } from '../../core/stream/stream-pipeline.service.js';

@Component({
  selector: 'app-fleet-table',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ScrollingModule, FlashChangeDirective],
  template: `
    <div class="fleet-container" [class.is-stale]="pipeline.isStale()">
      <!-- Toolbar Controls -->
      <header class="fleet-controls" role="search" aria-label="Fleet Search and Filters">
        <div class="search-box">
          <label for="fleet-search" class="sr-only">Search services by name, ID or team</label>
          <input
            id="fleet-search"
            type="search"
            class="control-input search-input"
            placeholder="Search by ID, name or team... (e.g. payments, svc-0042)"
            [ngModel]="store.searchQuery()"
            (ngModelChange)="store.setSearch($event)"
            autocomplete="off"
          />
        </div>

        <div class="filter-group" role="group" aria-label="Status Filters">
          <label for="status-filter" class="filter-label">Status:</label>
          <select
            id="status-filter"
            class="control-select"
            [ngModel]="store.statusFilter()"
            (ngModelChange)="store.setStatus($event)"
          >
            <option value="all">All Services</option>
            <option value="healthy">Healthy</option>
            <option value="degraded">Degraded</option>
            <option value="down">Down</option>
          </select>
        </div>

        <div class="fleet-summary" aria-live="polite">
          Showing <strong>{{ store.filteredAndSortedRows().length }}</strong> of 2,000 services
        </div>
      </header>

      <!-- Table Header -->
      <div class="table-header-row" role="row">
        <div class="col col-id sortable" (click)="store.setSort('id')" tabindex="0" (keydown.enter)="store.setSort('id')">
          Service ID <span class="sort-icon">{{ getSortIcon('id') }}</span>
        </div>
        <div class="col col-name sortable" (click)="store.setSort('name')" tabindex="0" (keydown.enter)="store.setSort('name')">
          Service Name <span class="sort-icon">{{ getSortIcon('name') }}</span>
        </div>
        <div class="col col-team sortable" (click)="store.setSort('team')" tabindex="0" (keydown.enter)="store.setSort('team')">
          Team <span class="sort-icon">{{ getSortIcon('team') }}</span>
        </div>
        <div class="col col-status sortable" (click)="store.setSort('status')" tabindex="0" (keydown.enter)="store.setSort('status')">
          Status <span class="sort-icon">{{ getSortIcon('status') }}</span>
        </div>
        <div class="col col-metric sortable" (click)="store.setSort('p95')" tabindex="0" (keydown.enter)="store.setSort('p95')">
          p95 Latency <span class="sort-icon">{{ getSortIcon('p95') }}</span>
        </div>
        <div class="col col-metric sortable" (click)="store.setSort('errRate')" tabindex="0" (keydown.enter)="store.setSort('errRate')">
          Error Rate <span class="sort-icon">{{ getSortIcon('errRate') }}</span>
        </div>
        <div class="col col-metric sortable" (click)="store.setSort('rps')" tabindex="0" (keydown.enter)="store.setSort('rps')">
          RPS <span class="sort-icon">{{ getSortIcon('rps') }}</span>
        </div>
        <div class="col col-action">Action</div>
      </div>

      <!-- CDK Virtual Scroll Viewport: Keeps DOM rows strictly under 60 -->
      <cdk-virtual-scroll-viewport itemSize="48" class="fleet-viewport" aria-label="Microservices Fleet Table">
        <div
          *cdkVirtualFor="let row of store.filteredAndSortedRows(); trackBy: trackByServiceId"
          class="table-row"
          role="row"
          tabindex="0"
          (keydown.enter)="openService(row.id)"
          (click)="openService(row.id)"
        >
          <div class="col col-id font-mono" role="cell">
            <a [routerLink]="['/services', row.id]" class="service-link" (click)="$event.stopPropagation()">{{ row.id }}</a>
          </div>
          <div class="col col-name font-semibold" role="cell">{{ row.name }}</div>
          <div class="col col-team" role="cell">
            <span class="team-badge">{{ row.team }}</span>
          </div>
          <div class="col col-status" role="cell">
            <span
              class="status-pill status-{{ row.status }}"
              [appFlashChange]="row.status"
            >
              {{ row.status }}
            </span>
          </div>
          <div class="col col-metric font-mono" role="cell">
            {{ row.p95 }} ms
          </div>
          <div class="col col-metric font-mono" role="cell" [class.text-danger]="row.errRate > 5">
            {{ row.errRate.toFixed(1) }}%
          </div>
          <div class="col col-metric font-mono" role="cell">
            {{ row.rps | number }}
          </div>
          <div class="col col-action" role="cell">
            <a [routerLink]="['/services', row.id]" class="view-btn" (click)="$event.stopPropagation()">View &rarr;</a>
          </div>
        </div>
      </cdk-virtual-scroll-viewport>

      @if (store.filteredAndSortedRows().length === 0 && !store.isLoading()) {
        <div class="empty-state">
          <p>No services match your search or filter criteria.</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .fleet-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-card, #1e222d);
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border-color, #2a2e39);
      position: relative;
    }

    .fleet-container.is-stale {
      opacity: 0.78;
    }

    .fleet-controls {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 18px;
      background: var(--bg-panel, #181b24);
      border-bottom: 1px solid var(--border-color, #2a2e39);
    }

    .search-box {
      flex: 1;
      max-width: 480px;
    }

    .control-input, .control-select {
      width: 100%;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--border-color, #363c4e);
      background: var(--bg-input, #12141a);
      color: var(--text-primary, #e1e4ea);
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .control-input:focus, .control-select:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .filter-label {
      font-size: 13px;
      color: var(--text-muted, #94a3b8);
      font-weight: 500;
    }

    .fleet-summary {
      margin-left: auto;
      font-size: 13px;
      color: var(--text-muted, #94a3b8);
    }

    .table-header-row {
      display: flex;
      align-items: center;
      height: 42px;
      padding: 0 16px;
      background: var(--bg-header, #151720);
      border-bottom: 2px solid var(--border-color, #2a2e39);
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted, #94a3b8);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .fleet-viewport {
      flex: 1;
      height: calc(100vh - 220px);
      min-height: 500px;
    }

    .table-row {
      display: flex;
      align-items: center;
      height: 48px;
      padding: 0 16px;
      border-bottom: 1px solid var(--border-row, #242834);
      font-size: 13px;
      color: var(--text-primary, #e1e4ea);
      cursor: pointer;
      transition: background-color 0.15s ease;
    }

    .table-row:hover {
      background-color: var(--bg-hover, #232736);
    }

    .table-row:focus-visible {
      outline: 2px solid #3b82f6;
      outline-offset: -2px;
    }

    .col {
      padding: 0 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sortable {
      cursor: pointer;
      user-select: none;
    }

    .sortable:hover {
      color: var(--text-primary, #ffffff);
    }

    .col-id { flex: 0 0 120px; }
    .col-name { flex: 1 1 220px; }
    .col-team { flex: 0 0 130px; }
    .col-status { flex: 0 0 120px; }
    .col-metric { flex: 0 0 130px; text-align: right; }
    .col-action { flex: 0 0 90px; text-align: center; }

    .service-link {
      color: #60a5fa;
      text-decoration: none;
      font-weight: 600;
    }

    .service-link:hover {
      text-decoration: underline;
    }

    .team-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(148, 163, 184, 0.12);
      color: #94a3b8;
      font-size: 11px;
      font-weight: 500;
    }

    .status-pill {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      transition: transform 0.2s, background-color 0.3s;
    }

    .status-healthy {
      background: rgba(34, 197, 94, 0.16);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }

    .status-degraded {
      background: rgba(234, 179, 8, 0.16);
      color: #facc15;
      border: 1px solid rgba(234, 179, 8, 0.3);
    }

    .status-down {
      background: rgba(239, 68, 68, 0.16);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    /* Flashing animation when status changes */
    .status-flashing {
      animation: pulse-flash 0.65s ease-out;
    }

    @keyframes pulse-flash {
      0% {
        transform: scale(1.25);
        box-shadow: 0 0 14px 4px currentColor;
      }
      50% {
        transform: scale(1.12);
      }
      100% {
        transform: scale(1);
      }
    }

    .view-btn {
      display: inline-block;
      padding: 3px 8px;
      font-size: 11px;
      color: #93c5fd;
      border-radius: 4px;
      border: 1px solid rgba(147, 197, 253, 0.25);
      text-decoration: none;
    }

    .view-btn:hover {
      background: rgba(147, 197, 253, 0.15);
    }

    .text-danger {
      color: #f87171;
      font-weight: 600;
    }

    .font-mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .font-semibold {
      font-weight: 600;
    }

    .empty-state {
      padding: 48px;
      text-align: center;
      color: var(--text-muted, #94a3b8);
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  `]
})
export class FleetTableComponent implements OnInit, OnDestroy {
  public store = inject(FleetStore);
  public pipeline = inject(StreamPipelineService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  ngOnInit(): void {
    // Synchronize initial state from URL query parameters
    const snapshot = this.route.snapshot.queryParams;
    this.store.syncFromUrlParams(snapshot);
    this.store.init();
  }

  ngOnDestroy(): void {
    this.store.destroy();
  }

  trackByServiceId(index: number, row: ServiceTableRow): string {
    return row.id;
  }

  getSortIcon(col: string): string {
    if (this.store.sortColumn() !== col) return '↕';
    return this.store.sortDirection() === 'asc' ? '▲' : '▼';
  }

  openService(serviceId: string): void {
    this.router.navigate(['/services', serviceId]);
  }
}
