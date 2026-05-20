'use client';

import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

function Check() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.6 7.4 5.4 10.2 11.4 3.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Copies the report's public `/r/[token]` link, with a brief confirmation. */
export function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${token}`);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. denied permission), the PM can retry.
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={copy}
      aria-live="polite"
      // Sized for the wider "Link copied" state so the label swap never reflows.
      className="min-w-[7.5rem]"
    >
      {copied ? (
        <>
          <Check />
          Link copied
        </>
      ) : (
        'Copy link'
      )}
    </Button>
  );
}
