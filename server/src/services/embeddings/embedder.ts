import { env } from '../../config/env';
import { metrics } from '../metrics';

/** A function that turns one batch of texts into their embedding vectors. */
export type EmbedApi = (texts: string[]) => Promise<number[][]>;

export interface EmbedOptions {
  batchSize?: number;
  /** Injectable single-batch API call (defaults to the HF Inference API). */
  callApi?: EmbedApi;
  /** Reports cumulative progress after each batch. */
  onProgress?: (processed: number, total: number) => void;
}

/** Normalizes HF feature-extraction output to a strict `number[][]`. */
function normalizeEmbeddings(data: unknown, expectedCount: number): number[][] {
  if (!Array.isArray(data)) {
    throw new Error('Embedding API returned a non-array response');
  }
  // Single input can come back as a flat number[].
  if (expectedCount === 1 && data.length > 0 && typeof data[0] === 'number') {
    return [data as number[]];
  }
  if (data.length > 0 && !Array.isArray(data[0])) {
    throw new Error('Unexpected embedding response shape (expected number[][])');
  }
  return data as number[][];
}

/**
 * Calls the Hugging Face Inference API feature-extraction endpoint for one batch.
 * Exported for direct testing of the request/response contract.
 */
export async function callHfFeatureExtraction(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const url = `${env.hfEmbeddingBase}${env.embeddingModel}/pipeline/feature-extraction`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.hfApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HF embedding request failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return normalizeEmbeddings(data, texts.length);
}

/**
 * Embeds an ordered list of texts, splitting into batches to respect API
 * limits. Output order matches input order.
 */
export async function embedTexts(
  texts: string[],
  options: EmbedOptions = {},
): Promise<number[][]> {
  const batchSize = options.batchSize ?? env.embeddingBatchSize;
  const callApi = options.callApi ?? callHfFeatureExtraction;

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const t0 = Date.now();
    const vectors = await callApi(batch);
    metrics.observe('embed.batch_latency_ms', Date.now() - t0);
    metrics.incr('embed.batches');
    metrics.incr('embed.texts', batch.length);
    out.push(...vectors);
    options.onProgress?.(out.length, texts.length);
  }
  return out;
}
