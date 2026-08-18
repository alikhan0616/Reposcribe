import { metrics, recordToolCall } from '../src/services/metrics';

describe('metrics registry', () => {
  beforeEach(() => metrics.reset());

  it('accumulates counters', () => {
    metrics.incr('a');
    metrics.incr('a', 2);
    expect(metrics.snapshot().counters.a).toBe(3);
  });

  it('summarizes latency histograms with percentiles', () => {
    for (let i = 1; i <= 100; i++) metrics.observe('lat', i);
    const h = metrics.snapshot().histograms.lat;
    expect(h.count).toBe(100);
    expect(h.min).toBe(1);
    expect(h.max).toBe(100);
    expect(h.p50).toBeGreaterThanOrEqual(50);
    expect(h.p95).toBeGreaterThanOrEqual(95);
    expect(h.avg).toBeCloseTo(50.5, 1);
  });

  it('records a tool call as count + ok/error + latency', () => {
    recordToolCall('search_codebase', 42, true);
    recordToolCall('search_codebase', 10, false);
    const snap = metrics.snapshot();
    expect(snap.counters['tool.search_codebase.calls']).toBe(2);
    expect(snap.counters['tool.search_codebase.ok']).toBe(1);
    expect(snap.counters['tool.search_codebase.error']).toBe(1);
    expect(snap.histograms['tool.search_codebase.latency_ms'].count).toBe(2);
  });
});
