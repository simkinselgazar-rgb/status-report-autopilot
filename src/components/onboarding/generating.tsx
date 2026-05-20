'use client';

import { useEffect, useState } from 'react';

import { CheckIcon } from './icons';

/** What the report run actually does, across whatever sources are connected. */
const LINES = [
  'Pulling this week’s activity from your tools',
  'Reading tasks, milestones, and comments',
  'Writing the narrative in your voice',
];

const STEP_MS = 720;

/**
 * The generation animation. Visual only, the wizard owns the real request and
 * unmounts this when the draft lands. The last line stays active (the
 * narrative genuinely is still being written) until then.
 */
export function Generating({ clientName }: { clientName: string }) {
  const [done, setDone] = useState(0);
  const client = clientName.trim() || 'your client';

  useEffect(() => {
    const timers: number[] = [];
    // Complete every line except the last; the last stays active until unmount.
    for (let index = 0; index < LINES.length - 1; index++) {
      timers.push(window.setTimeout(() => setDone(index + 1), STEP_MS * (index + 1)));
    }
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);

  return (
    <div className="w-full max-w-[26rem] anim-fade">
      <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">
        One moment
      </p>
      <h1 className="mt-3 font-serif text-[1.7rem] leading-[1.2] tracking-[-0.015em] text-ink">
        Reading {client}&rsquo;s week.
      </h1>

      <ul className="mt-8 space-y-3.5">
        {LINES.map((line, index) => {
          const isDone = index < done;
          const isActive = index === done;
          return (
            <li key={line} className="flex items-center gap-3">
              <span
                className={`grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-300 ease-out ${
                  isDone ? 'bg-pine text-paper' : 'bg-sunk'
                }`}
              >
                {isDone ? (
                  <CheckIcon className="size-3" />
                ) : (
                  <span
                    className={`size-1.5 rounded-full ${
                      isActive ? 'bg-ink-soft' : 'bg-line-strong'
                    }`}
                    style={
                      isActive
                        ? { animation: 'pulse-soft 1.1s ease-in-out infinite' }
                        : undefined
                    }
                  />
                )}
              </span>
              <span
                className={`text-[0.98rem] transition-colors duration-300 ${
                  isDone || isActive ? 'text-ink' : 'text-ink-faint'
                }`}
              >
                {line}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
