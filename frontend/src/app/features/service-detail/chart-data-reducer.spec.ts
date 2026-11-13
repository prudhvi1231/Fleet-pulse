import { describe, it, expect } from 'vitest';
import { lttbDownsample } from './chart-data-reducer.js';
import { HistoryPoint } from '../../core/models/service.model.js';

describe('Chart Data Reducer (LTTB Downsampling)', () => {
  it('should not downsample if array length is less than or equal to target', () => {
    const points: HistoryPoint[] = [
      { ts: 1000, p95: 100, errRate: 0.1, rps: 1000 },
      { ts: 2000, p95: 120, errRate: 0.2, rps: 1050 }
    ];
    const result = lttbDownsample(points, 300);
    expect(result.length).toBe(2);
    expect(result).toEqual(points);
  });

  it('should downsample 900 raw points down to strictly 300 target points', () => {
    const rawPoints: HistoryPoint[] = [];
    const now = Date.now();
    for (let i = 0; i < 900; i++) {
      rawPoints.push({
        ts: now + i * 1000,
        p95: 100 + (i % 20) * 5,
        errRate: (i % 10) * 0.5,
        rps: 1200 + (i % 50)
      });
    }

    const result = lttbDownsample(rawPoints, 300);
    expect(result.length).toBe(300);
    // Preserves first and last points
    expect(result[0].ts).toBe(rawPoints[0].ts);
    expect(result[result.length - 1].ts).toBe(rawPoints[rawPoints.length - 1].ts);
  });

  it('should preserve critical incident peak spikes during downsampling', () => {
    const points: HistoryPoint[] = [];
    const now = Date.now();
    for (let i = 0; i < 500; i++) {
      points.push({
        ts: now + i * 1000,
        p95: i === 250 ? 2500 : 80, // Massive spike at index 250
        errRate: 0.1,
        rps: 1000
      });
    }

    const downsampled = lttbDownsample(points, 300);
    expect(downsampled.length).toBe(300);
    const maxP95 = Math.max(...downsampled.map((p) => p.p95));
    // The critical peak of 2500 must be captured!
    expect(maxP95).toBe(2500);
  });
});
