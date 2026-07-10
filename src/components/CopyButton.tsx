"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy fix for Claude Code" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="w-full rounded-control bg-elevated px-4 py-2 text-xs font-semibold text-bone hover:bg-elevated/70"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
