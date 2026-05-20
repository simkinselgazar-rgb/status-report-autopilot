import type { OnboardingState } from '@/lib/onboarding/types';
import { stagger } from '@/lib/style';
import { WizardFooter } from './wizard-footer';

interface Props {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
  onNext: () => void;
}

const FIELD_CLASSES =
  'mt-2 h-12 w-full rounded-xl border border-line bg-sunk px-4 text-[1.05rem] text-ink ' +
  'transition-[border-color,background-color] duration-150 ease-out placeholder:text-ink-faint ' +
  'focus:border-line-strong focus:bg-surface focus:outline-2 focus:outline-offset-2 focus:outline-focus';

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function StepSelectClient({ state, update, onNext }: Props) {
  const valid = state.clientName.trim().length > 0 && isEmail(state.clientEmail);

  function submitOnEnter(event: { key: string }): void {
    if (event.key === 'Enter' && valid) onNext();
  }

  return (
    <div className="anim-stagger">
      <header style={stagger(0)}>
        <h1 className="font-serif text-[1.95rem] leading-[1.15] tracking-[-0.018em] text-ink">
          Who&rsquo;s this report for?
        </h1>
        <p className="mt-3 max-w-[34ch] text-[1rem] leading-relaxed text-ink-soft">
          Start with one client. You can add the rest once you&rsquo;ve seen how
          this works.
        </p>
      </header>

      <div className="mt-8" style={stagger(1)}>
        <label htmlFor="client-name" className="block text-[0.82rem] font-medium text-ink-soft">
          Client name
        </label>
        <input
          id="client-name"
          type="text"
          value={state.clientName}
          autoFocus
          autoComplete="off"
          placeholder="Northwind Studio"
          onChange={(event) => update({ clientName: event.target.value })}
          onKeyDown={submitOnEnter}
          className={FIELD_CLASSES}
        />
      </div>

      <div className="mt-5" style={stagger(2)}>
        <label htmlFor="client-email" className="block text-[0.82rem] font-medium text-ink-soft">
          Client email
        </label>
        <input
          id="client-email"
          type="email"
          inputMode="email"
          value={state.clientEmail}
          autoComplete="off"
          placeholder="maya@northwindstudio.com"
          onChange={(event) => update({ clientEmail: event.target.value })}
          onKeyDown={submitOnEnter}
          className={FIELD_CLASSES}
        />
        <p className="mt-2 text-[0.82rem] leading-relaxed text-ink-faint">
          Where approved reports are sent. You review every one before it goes out.
        </p>
      </div>

      <div style={stagger(3)}>
        <WizardFooter onNext={onNext} nextDisabled={!valid} />
      </div>
    </div>
  );
}
