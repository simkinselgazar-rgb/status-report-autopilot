'use client';

import { buttonClasses } from '@/components/ui/button';

/**
 * Dashboard error boundary, the page reads the product DB, so a connection
 * failure surfaces here instead of an unstyled crash. `reset` retries the
 * server render.
 */
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-paper px-6 text-ink">
      <div className="max-w-[26rem] text-center">
        <h1 className="font-serif text-[1.5rem] tracking-[-0.015em] text-ink">
          We couldn&rsquo;t load your dashboard.
        </h1>
        <p className="mt-2 text-[0.96rem] leading-relaxed text-ink-soft">
          Something went wrong reaching your reports. This is usually temporary.
        </p>
        <button type="button" onClick={reset} className={`${buttonClasses()} mt-6`}>
          Try again
        </button>
      </div>
    </div>
  );
}
