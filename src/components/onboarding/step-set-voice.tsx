import {
  LENGTHS,
  TONES,
  type OnboardingState,
} from '@/lib/onboarding/types';
import { stagger } from '@/lib/style';
import { Segmented } from './segmented';
import { WizardFooter } from './wizard-footer';

interface Props {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepSetVoice({ state, update, onBack, onNext }: Props) {
  return (
    <div className="anim-stagger">
      <header style={stagger(0)}>
        <h1 className="font-serif text-[1.95rem] leading-[1.15] tracking-[-0.018em] text-ink">
          How should it sound?
        </h1>
        <p className="mt-3 max-w-[40ch] text-[1rem] leading-relaxed text-ink-soft">
          Reports go out in your agency&rsquo;s voice &mdash; not a robot&rsquo;s.
          A few quick calibrations.
        </p>
      </header>

      <div className="mt-8" style={stagger(1)}>
        <Segmented
          label="Tone"
          options={TONES}
          value={state.tone}
          onChange={(tone) => update({ tone })}
        />
      </div>

      <div className="mt-6" style={stagger(2)}>
        <Segmented
          label="Detail"
          options={LENGTHS}
          value={state.length}
          onChange={(length) => update({ length })}
        />
      </div>

      <div className="mt-6 grid gap-4" style={stagger(3)}>
        <div>
          <label
            htmlFor="signoff"
            className="block text-[0.82rem] font-medium text-ink-soft"
          >
            Sign-off
          </label>
          <input
            id="signoff"
            type="text"
            value={state.signoff}
            autoComplete="off"
            placeholder="The Northwind team"
            onChange={(event) => update({ signoff: event.target.value })}
            className="mt-2 h-11 w-full rounded-xl border border-line bg-sunk px-4 text-[0.98rem] text-ink transition-[border-color,background-color] duration-150 ease-out placeholder:text-ink-faint focus:border-line-strong focus:bg-surface focus:outline-2 focus:outline-offset-2 focus:outline-focus"
          />
        </div>

        <div>
          <label
            htmlFor="voice-sample"
            className="block text-[0.82rem] font-medium text-ink-soft"
          >
            A sentence that sounds like you{' '}
            <span className="font-normal text-ink-faint">&mdash; optional</span>
          </label>
          <textarea
            id="voice-sample"
            rows={3}
            value={state.voiceSample}
            placeholder="Paste a line from a report you were proud to send."
            onChange={(event) => update({ voiceSample: event.target.value })}
            className="mt-2 w-full resize-none rounded-xl border border-line bg-sunk px-4 py-3 text-[0.98rem] leading-relaxed text-ink transition-[border-color,background-color] duration-150 ease-out placeholder:text-ink-faint focus:border-line-strong focus:bg-surface focus:outline-2 focus:outline-offset-2 focus:outline-focus"
          />
        </div>
      </div>

      <div style={stagger(4)}>
        <WizardFooter onBack={onBack} onNext={onNext} />
      </div>
    </div>
  );
}
