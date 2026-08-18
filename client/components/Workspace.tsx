"use client";

import { useEffect, useState } from "react";
import { getRepoMeta } from "@/lib/api";
import { Chat } from "./Chat";
import { FileTree } from "./FileTree";
import { FileViewer } from "./FileViewer";
import type { Citation, RepoMeta } from "@/lib/types";
import Link from "next/link";

/** Main app once a repo is indexed: file tree · chat · file viewer. */
export function Workspace({
  repoId,
  onReset,
}: {
  repoId: string;
  onReset: () => void;
}) {
  const [meta, setMeta] = useState<RepoMeta | null>(null);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRepoMeta(repoId)
      .then((m) => !cancelled && setMeta(m))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [repoId]);

  const repoName =
    meta?.repoUrl?.replace(/^https?:\/\/github\.com\//, "") ?? repoId;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="shrink-0 flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-800">
        <div className="flex items-baseline gap-3">
          <Link href="/">
            <span onClick={onReset} className="font-bold">
              RepoScribe
            </span>
          </Link>
          <span className="font-mono text-sm text-gray-500">{repoName}</span>
          {meta && (
            <span className="text-xs text-gray-400">
              {meta.fileCount} files · {meta.chunkCount} chunks
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onReset}
          className="rounded border border-gray-300 px-3 mx-10 py-1 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          Switch repo
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-12 overflow-hidden">
        <aside className="col-span-3 min-h-0 overflow-hidden border-r border-gray-200 dark:border-gray-800 lg:col-span-2">
          <FileTree
            files={meta?.files ?? []}
            activeFile={activeCitation?.filepath}
            onSelect={(filepath) =>
              setActiveCitation({
                raw: filepath,
                filepath,
                startLine: 1,
                endLine: 1,
              })
            }
          />
        </aside>

        <section
          className={[
            "min-h-0 overflow-hidden",
            activeCitation
              ? "col-span-5 lg:col-span-6"
              : "col-span-9 lg:col-span-10",
          ].join(" ")}
        >
          <Chat repoId={repoId} onCitationSelect={setActiveCitation} />
        </section>

        {activeCitation && (
          <section className="col-span-4 min-h-0 overflow-hidden">
            <FileViewer
              repoId={repoId}
              citation={activeCitation}
              onClose={() => setActiveCitation(null)}
            />
          </section>
        )}
      </div>
    </div>
  );
}
