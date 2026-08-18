import { env } from '../../../config/env';

export interface CreateIssueResult {
  url: string;
  number: number;
}

/** Extracts `owner/repo` from a GitHub URL, or null if it isn't one. */
export function parseGitHubRepo(repoUrl: string): string | null {
  try {
    const u = new URL(repoUrl);
    if (!u.hostname.toLowerCase().includes('github.com')) return null;
    const [owner, repo] = u.pathname.split('/').filter(Boolean);
    if (owner && repo) return `${owner}/${repo.replace(/\.git$/, '')}`;
  } catch {
    // fall through
  }
  return null;
}

export interface GitHubRepoInfo {
  private: boolean;
  sizeKb: number;
  defaultBranch: string;
}

function githubHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'RepoScribe',
    ...(env.githubToken ? { Authorization: `Bearer ${env.githubToken}` } : {}),
  };
}

/**
 * Fetches repo metadata (`owner/repo`) from the GitHub API. Returns null for a
 * 404 (not found or private without access). Used to reject bad repos before
 * enqueuing an ingestion job.
 */
export async function getRepoInfo(repo: string): Promise<GitHubRepoInfo | null> {
  const res = await fetch(`https://api.github.com/repos/${repo}`, { headers: githubHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API error (${res.status}): ${text.slice(0, 200)}`);
  }
  const j = (await res.json()) as { private: boolean; size: number; default_branch: string };
  return { private: j.private, sizeKb: j.size, defaultBranch: j.default_branch };
}

/** Creates a GitHub issue via the REST API. Requires `GITHUB_TOKEN`. */
export async function createIssue(
  repo: string,
  title: string,
  body: string,
): Promise<CreateIssueResult> {
  if (!env.githubToken) throw new Error('GITHUB_TOKEN is not configured');
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.githubToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'RepoScribe',
    },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API error (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { html_url: string; number: number };
  return { url: json.html_url, number: json.number };
}
