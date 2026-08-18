import { embedTexts, callHfFeatureExtraction } from '../../src/services/embeddings/embedder';

describe('embedTexts batching', () => {
  it('splits inputs into batches of the configured size, preserving order', async () => {
    const calls: string[][] = [];
    const callApi = jest.fn(async (batch: string[]) => {
      calls.push(batch);
      // Return a 1-dim vector encoding the text index for order assertions.
      return batch.map((t) => [Number(t.replace('t', ''))]);
    });

    const texts = Array.from({ length: 25 }, (_, i) => `t${i}`);
    const vectors = await embedTexts(texts, { batchSize: 10, callApi });

    expect(callApi).toHaveBeenCalledTimes(3);
    expect(calls.map((c) => c.length)).toEqual([10, 10, 5]);
    expect(vectors).toHaveLength(25);
    // Order preserved end-to-end.
    expect(vectors.map((v) => v[0])).toEqual(texts.map((_, i) => i));
  });

  it('reports cumulative progress after each batch', async () => {
    const progress: Array<[number, number]> = [];
    const callApi = jest.fn(async (batch: string[]) => batch.map(() => [0]));
    await embedTexts(['a', 'b', 'c'], {
      batchSize: 2,
      callApi,
      onProgress: (p, t) => progress.push([p, t]),
    });
    expect(progress).toEqual([
      [2, 3],
      [3, 3],
    ]);
  });

  it('returns empty for empty input without calling the API', async () => {
    const callApi = jest.fn();
    const out = await embedTexts([], { callApi });
    expect(out).toEqual([]);
    expect(callApi).not.toHaveBeenCalled();
  });
});

describe('callHfFeatureExtraction', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('POSTs to the model endpoint with auth + inputs and returns number[][]', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const out = await callHfFeatureExtraction(['hello', 'world']);

    expect(out).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/pipeline/feature-extraction');
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
    expect(JSON.parse(init.body as string).inputs).toEqual(['hello', 'world']);
  });

  it('wraps a flat number[] response for a single input', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => [0.5, 0.6, 0.7],
    })) as unknown as typeof fetch;

    const out = await callHfFeatureExtraction(['solo']);
    expect(out).toEqual([[0.5, 0.6, 0.7]]);
  });

  it('throws with status + body on a non-ok response', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => 'model loading',
    })) as unknown as typeof fetch;

    await expect(callHfFeatureExtraction(['x'])).rejects.toThrow(/503.*model loading/);
  });
});
