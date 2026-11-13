import { HistoryPoint } from '../../core/models/service.model.js';

/**
 * Largest-Triangle-Three-Buckets (LTTB) Downsampling Algorithm.
 * Reduces a time series of N points to K target points (max 300) while
 * preserving visual peaks, valleys, and critical incident spikes.
 */
export function lttbDownsample(data: HistoryPoint[], targetPoints: number): HistoryPoint[] {
  if (data.length <= targetPoints || targetPoints <= 2) {
    return data;
  }

  const sampled: HistoryPoint[] = [];
  const bucketSize = (data.length - 2) / (targetPoints - 2);

  let aIndex = 0;
  sampled.push(data[aIndex]); // Always include first point

  for (let i = 0; i < targetPoints - 2; i++) {
    // 1. Calculate average point for the next bucket (bucket C)
    const cBucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const cBucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length);

    let avgX = 0;
    let avgY = 0;
    const cCount = cBucketEnd - cBucketStart;

    for (let c = cBucketStart; c < cBucketEnd; c++) {
      avgX += data[c].ts;
      avgY += data[c].p95;
    }
    avgX /= cCount || 1;
    avgY /= cCount || 1;

    // 2. Find point in current bucket (bucket B) with largest triangle area with A and avg C
    const bBucketStart = Math.floor(i * bucketSize) + 1;
    const bBucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length);

    const pointA = data[aIndex];
    let maxArea = -1;
    let maxAreaIndex = bBucketStart;

    for (let b = bBucketStart; b < bBucketEnd; b++) {
      const point = data[b];
      // Triangle area = 0.5 * |xA(yB - yC) + xB(yC - yA) + xC(yA - yB)|
      const area = Math.abs(
        (pointA.ts - avgX) * (point.p95 - pointA.p95) -
        (pointA.ts - point.ts) * (avgY - pointA.p95)
      ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        maxAreaIndex = b;
      }
    }

    sampled.push(data[maxAreaIndex]);
    aIndex = maxAreaIndex; // Next triangle starts at chosen point
  }

  sampled.push(data[data.length - 1]); // Always include last point
  return sampled;
}
