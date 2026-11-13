import { Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild, AfterViewInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HistoryPoint } from '../../core/models/service.model.js';

@Component({
  selector: 'app-metric-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-wrapper">
      <div class="chart-header">
        <div class="chart-title-group">
          <span class="chart-title">{{ title }}</span>
          <span class="chart-unit">({{ unit }})</span>
        </div>
        <div class="chart-stats">
          <span class="stat-item">Latest: <strong>{{ latestValue }}</strong> {{ unit }}</span>
          <span class="stat-item">Max: <strong>{{ maxValue }}</strong></span>
          <span class="stat-item">Points: {{ points.length }} / 300</span>
        </div>
      </div>

      <div class="canvas-container">
        @if (hasError) {
          <div class="chart-error">
            <p>Failed to render chart data.</p>
            <button class="retry-btn" (click)="retryRender()">Retry</button>
          </div>
        } @else {
          <canvas #canvasElement class="chart-canvas"></canvas>
        }
      </div>
    </div>
  `,
  styles: [`
    .chart-wrapper {
      background: var(--bg-card, #1e222d);
      border: 1px solid var(--border-color, #2a2e39);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      height: 260px;
    }

    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .chart-title-group {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }

    .chart-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary, #e1e4ea);
    }

    .chart-unit {
      font-size: 12px;
      color: var(--text-muted, #94a3b8);
    }

    .chart-stats {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: var(--text-muted, #94a3b8);
    }

    .chart-stats strong {
      color: var(--text-primary, #ffffff);
    }

    .canvas-container {
      flex: 1;
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .chart-canvas {
      width: 100%;
      height: 100%;
      display: block;
    }

    .chart-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #f87171;
      font-size: 13px;
    }

    .retry-btn {
      margin-top: 8px;
      padding: 4px 12px;
      background: #3b82f6;
      color: #ffffff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .retry-btn:hover {
      background: #2563eb;
    }
  `]
})
export class MetricChartComponent implements AfterViewInit, OnChanges {
  @Input() title: string = '';
  @Input() unit: string = '';
  @Input() metricKey: 'p95' | 'errRate' | 'rps' = 'p95';
  @Input() color: string = '#3b82f6';
  @Input() points: HistoryPoint[] = [];

  @ViewChild('canvasElement') canvasRef!: ElementRef<HTMLCanvasElement>;

  public hasError = false;
  public latestValue: string = '0';
  public maxValue: string = '0';

  ngAfterViewInit(): void {
    this.render();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['points'] && this.canvasRef) {
      this.render();
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.render();
  }

  public retryRender(): void {
    this.hasError = false;
    setTimeout(() => this.render(), 50);
  }

  private render(): void {
    if (!this.canvasRef || this.hasError) return;

    try {
      const canvas = this.canvasRef.nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const width = rect.width;
      const height = rect.height;

      ctx.clearRect(0, 0, width, height);

      if (this.points.length < 2) {
        ctx.fillStyle = '#64748b';
        ctx.font = '12px sans-serif';
        ctx.fillText('Waiting for metrics data...', 20, height / 2);
        return;
      }

      // Compute bounds
      const values = this.points.map((p) => p[this.metricKey]);
      const latest = values[values.length - 1];
      const max = Math.max(...values);
      const min = Math.min(...values);

      this.latestValue = typeof latest === 'number' ? (this.metricKey === 'errRate' ? latest.toFixed(1) : Math.round(latest).toString()) : '0';
      this.maxValue = typeof max === 'number' ? (this.metricKey === 'errRate' ? max.toFixed(1) : Math.round(max).toString()) : '0';

      const padding = { top: 10, right: 15, bottom: 25, left: 45 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;

      // Draw grid lines
      ctx.strokeStyle = '#2a2e39';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const gridLines = 4;
      for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (chartHeight / gridLines) * i;
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);

        // Y-axis label
        const labelVal = max - (i / gridLines) * (max - (min > 0 ? 0 : min));
        ctx.fillStyle = '#64748b';
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(this.metricKey === 'errRate' ? labelVal.toFixed(1) : Math.round(labelVal).toString(), padding.left - 6, y + 3);
      }
      ctx.stroke();

      // Draw series line
      const yRange = max === min ? 1 : max - (min > 0 ? 0 : min);
      const yBase = min > 0 ? 0 : min;

      ctx.beginPath();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;

      for (let i = 0; i < this.points.length; i++) {
        const x = padding.left + (i / (this.points.length - 1)) * chartWidth;
        const normalizedY = (values[i] - yBase) / yRange;
        const y = padding.top + chartHeight - normalizedY * chartHeight;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Draw subtle gradient under the curve
      ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
      ctx.lineTo(padding.left, padding.top + chartHeight);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
      gradient.addColorStop(0, `${this.color}33`); // 20% opacity
      gradient.addColorStop(1, `${this.color}00`);
      ctx.fillStyle = gradient;
      ctx.fill();

    } catch {
      this.hasError = true;
    }
  }
}
