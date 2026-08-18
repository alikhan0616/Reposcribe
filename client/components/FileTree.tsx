"use client";

interface FileTreeProps {
  files: string[];
  onSelect: (filepath: string) => void;
  activeFile?: string;
}

/** Sidebar listing the indexed repo files. */
export function FileTree({ files, onSelect, activeFile }: FileTreeProps) {
  return (
    <nav
      className="flex h-full min-h-0 flex-col overflow-hidden p-2"
      aria-label="Repository files"
    >
      <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-gray-500">
        Files ({files.length})
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {files.map((f) => (
          <li key={f}>
            <button
              type="button"
              onClick={() => onSelect(f)}
              className={[
                "w-full truncate rounded px-2 py-1 text-left font-mono text-xs hover:bg-gray-100 dark:hover:bg-gray-800",
                f === activeFile ? "bg-gray-100 dark:bg-gray-800" : "",
              ].join(" ")}
              title={f}
            >
              {f}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
