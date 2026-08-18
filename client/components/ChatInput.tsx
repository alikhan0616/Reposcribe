"use client";

import { useState, KeyboardEvent, FormEvent } from "react";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

/** Message composer. Submits on Enter (Shift+Enter for newline); disabled while streaming. */
export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  return (
    <form
      onSubmit={onFormSubmit}
      className="flex items-end gap-2 border-t border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950"
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder="Ask about the codebase…"
        aria-label="Chat message"
        disabled={disabled}
        className="max-h-40 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        Send
      </button>
    </form>
  );
}
