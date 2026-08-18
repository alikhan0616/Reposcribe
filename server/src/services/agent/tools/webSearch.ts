import { env } from '../../../config/env';

interface TavilyResult {
  title: string;
  content: string;
  url: string;
}

async function tavilySearch(query: string): Promise<string> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: env.tavilyApiKey, query, max_results: 5 }),
  });
  if (!res.ok) throw new Error(`Tavily search failed (${res.status})`);
  const json = (await res.json()) as { results?: TavilyResult[] };
  return (json.results ?? [])
    .map((r) => `- ${r.title}: ${r.content}\n  ${r.url}`)
    .join('\n');
}

async function duckDuckGoSearch(query: string): Promise<string> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DuckDuckGo search failed (${res.status})`);
  const json = (await res.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
  };
  const parts: string[] = [];
  if (json.AbstractText) {
    parts.push(json.AbstractText + (json.AbstractURL ? ` (${json.AbstractURL})` : ''));
  }
  for (const t of (json.RelatedTopics ?? []).slice(0, 5)) {
    if (t.Text) parts.push(`- ${t.Text}` + (t.FirstURL ? ` (${t.FirstURL})` : ''));
  }
  return parts.join('\n') || 'No web results found.';
}

/**
 * Web search for external/library docs. Uses Tavily when `TAVILY_API_KEY` is
 * set (better results), otherwise the keyless DuckDuckGo Instant Answer API.
 */
export async function webSearch(query: string): Promise<string> {
  return env.tavilyApiKey ? tavilySearch(query) : duckDuckGoSearch(query);
}
