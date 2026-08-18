/**
 * Lightweight in-process metrics: counters + latency histograms with
 * percentiles. Exposed via GET /api/metrics and logged for tool calls.
 * Not a replacement for Prometheus — a self-contained, demoable snapshot.
 */

export interface HistogramSummary {
  count: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

export interface MetricsSnapshot {
  uptimeSeconds: number;
  counters: Record<string, number>;
  histograms: Record<string, HistogramSummary>;
}

class MetricsRegistry {
  private counters = new Map<string, number>();
  private samples = new Map<string, number[]>();
  private readonly maxSamples = 2000;

  incr(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  /** Records a latency/size observation for percentile summaries. */
  observe(name: string, value: number): void {
    const arr = this.samples.get(name) ?? [];
    arr.push(value);
    if (arr.length > this.maxSamples) arr.shift();
    this.samples.set(name, arr);
  }

  private summarize(values: number[]): HistogramSummary {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const pct = (p: number) => (n ? sorted[Math.min(n - 1, Math.floor((p / 100) * n))] : 0);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      count: n,
      avg: n ? Math.round((sum / n) * 100) / 100 : 0,
      p50: pct(50),
      p95: pct(95),
      p99: pct(99),
      min: sorted[0] ?? 0,
      max: sorted[n - 1] ?? 0,
    };
  }

  snapshot(): MetricsSnapshot {
    const histograms: Record<string, HistogramSummary> = {};
    for (const [name, values] of this.samples) histograms[name] = this.summarize(values);
    return {
      uptimeSeconds: Math.round(process.uptime()),
      counters: Object.fromEntries([...this.counters].sort()),
      histograms,
    };
  }

  reset(): void {
    this.counters.clear();
    this.samples.clear();
  }
}

export const metrics = new MetricsRegistry();

/** Records a single agent tool invocation (count, ok/error, latency). */
export function recordToolCall(tool: string, latencyMs: number, ok: boolean): void {
  metrics.incr(`tool.${tool}.calls`);
  metrics.incr(`tool.${tool}.${ok ? 'ok' : 'error'}`);
  metrics.observe(`tool.${tool}.latency_ms`, latencyMs);
}
