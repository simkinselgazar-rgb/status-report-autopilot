import {
  TIME_SLOTS,
  WEEKDAYS,
  type OnboardingState,
  type TimeSlot,
  type Weekday,
} from '@/lib/onboarding/types';
import { stagger } from '@/lib/style';
import { WizardFooter } from './wizard-footer';

interface Props {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
  onBack: () => void;
  onGenerate: () => void;
}

/** Every IANA zone the runtime knows, the picker default is the PM's own zone. */
const TIME_ZONES: readonly string[] = Intl.supportedValuesOf('timeZone');

function pillClass(active: boolean): string {
  return `h-11 rounded-xl text-[0.9rem] font-medium transition-[background-color,color,border-color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
    active
      ? 'bg-ink text-paper'
      : 'border border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'
  }`;
}

export function StepPickCadence({ state, update, onBack, onGenerate }: Props) {
  return (
    <div className="anim-stagger">
      <header style={stagger(0)}>
        <h1 className="font-serif text-[1.95rem] leading-[1.15] tracking-[-0.018em] text-ink">
          When do you want it ready?
        </h1>
        <p className="mt-3 max-w-[40ch] text-[1rem] leading-relaxed text-ink-soft">
          We&rsquo;ll have a draft waiting for your review. Most teams pick
          Friday morning.
        </p>
      </header>

      <div className="mt-8" style={stagger(1)}>
        <p className="text-[0.82rem] font-medium text-ink-soft">Day of the week</p>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {WEEKDAYS.map((day) => (
            <button
              key={day.id}
              type="button"
              aria-pressed={state.day === day.id}
              onClick={() => update({ day: day.id as Weekday })}
              className={pillClass(state.day === day.id)}
            >
              {day.short}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6" style={stagger(2)}>
        <p className="text-[0.82rem] font-medium text-ink-soft">Ready by</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {TIME_SLOTS.map((slot) => (
            <button
              key={slot.id}
              type="button"
              aria-pressed={state.time === slot.id}
              onClick={() => update({ time: slot.id as TimeSlot })}
              className={pillClass(state.time === slot.id)}
            >
              {slot.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6" style={stagger(3)}>
        <label htmlFor="cadence-timezone" className="text-[0.82rem] font-medium text-ink-soft">
          Time zone
        </label>
        <div className="relative mt-2">
          <select
            id="cadence-timezone"
            value={state.timezone}
            onChange={(event) => update({ timezone: event.target.value })}
            className="h-11 w-full appearance-none rounded-xl border border-line bg-sunk pl-4 pr-10 text-[0.95rem] text-ink transition-[border-color,background-color] duration-150 ease-out hover:border-line-strong focus:border-line-strong focus:bg-surface focus:outline-2 focus:outline-offset-2 focus:outline-focus"
          >
            {TIME_ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
          >
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="mt-2 text-[0.8rem] leading-relaxed text-ink-faint">
          Detected automatically, change it if this client&rsquo;s week runs on a different zone.
        </p>
      </div>

      <div style={stagger(4)}>
        <WizardFooter
          onBack={onBack}
          onNext={onGenerate}
          nextLabel="Generate my first draft"
        />
      </div>
    </div>
  );
}
