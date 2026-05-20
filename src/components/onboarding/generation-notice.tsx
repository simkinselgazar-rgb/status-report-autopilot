import Link from 'next/link';

import { Button, buttonClasses } from '@/components/ui/button';
import { stagger } from '@/lib/style';

interface Props {
  variant: 'insufficient' | 'error';
  message: string;
  onRetry: () => void;
  onRestart: () => void;
}

/**
 * Shown when the magic-moment generation does not produce a draft, either a
 * genuinely quiet week (`insufficient`) or a failure (`error`). Calm, honest,
 * and always with a way forward.
 */
export function GenerationNotice({ variant, message, onRetry, onRestart }: Props) {
  const insufficient = variant === 'insufficient';

  return (
    <div className="w-full max-w-[30rem] anim-fade">
      <div style={stagger(0)}>
        <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          {insufficient ? 'A quiet week' : 'Something went wrong'}
        </p>
        <h1 className="mt-3 font-serif text-[1.7rem] leading-[1.2] tracking-[-0.015em] text-ink">
          {insufficient ? 'Not enough to report on yet.' : 'We couldn’t finish that draft.'}
        </h1>
        <p className="mt-3 text-[1rem] leading-relaxed text-ink-soft">{message}</p>
        {insufficient ? (
          <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-faint">
            That&rsquo;s normal early on, reports fill out as the work picks up.
          </p>
        ) : null}
      </div>

      <div style={stagger(1)} className="mt-8 flex items-center gap-3">
        {insufficient ? (
          <>
            <Link href="/" className={buttonClasses()}>
              Go to my dashboard
            </Link>
            <Button variant="ghost" onClick={onRetry}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onRetry}>Try again</Button>
            <Button variant="ghost" onClick={onRestart}>
              Back to setup
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
