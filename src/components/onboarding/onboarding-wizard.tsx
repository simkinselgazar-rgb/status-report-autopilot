'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { SourceEvent } from '@/lib/connectors/types';
import { INITIAL_STATE, type OnboardingState } from '@/lib/onboarding/types';
import { previousReportWeek, type ReportWeek } from '@/lib/reports/period';
import type { StatusReportDraft } from '@/lib/reports/types';
import { WizardProgress } from './wizard-progress';
import { StepSelectClient } from './step-select-client';
import { StepConnectSources } from './step-connect-sources';
import { StepSetVoice } from './step-set-voice';
import { StepPickCadence } from './step-pick-cadence';
import { Generating } from './generating';
import { FirstDraft } from './first-draft';
import { GenerationNotice } from './generation-notice';

type Outcome =
  | {
      status: 'drafted';
      draft: StatusReportDraft;
      periodLabel: string;
      /** Monday (`YYYY-MM-DD`) of the covered week, persisted as the report's period key. */
      periodStart: string;
      eventsUsed: number;
      sourceEvents: SourceEvent[];
    }
  | { status: 'insufficient'; reason: string }
  | { status: 'error'; message: string };

type View = { phase: 'steps' } | { phase: 'generating' } | { phase: 'result'; outcome: Outcome };

/** Hold the generation animation at least this long so it never flashes by. */
const MIN_GENERATING_MS = 2600;
const GENERIC_ERROR = "We couldn't reach the report service. Check your connection and try again.";
const SAVE_ERROR = "We couldn't save this client just now. Try again.";

interface GenerateResponse {
  ok: boolean;
  status?: 'drafted' | 'insufficient';
  draft?: StatusReportDraft;
  periodLabel?: string;
  eventsUsed?: number;
  sourceEvents?: SourceEvent[];
  reason?: string;
  error?: { message: string };
}

/** The PM's own timezone, the picker's default, falls back if detection fails. */
function detectTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || INITIAL_STATE.timezone;
}

async function runGeneration(state: OnboardingState, week: ReportWeek): Promise<Outcome> {
  if (state.connections.length === 0) {
    return { status: 'error', message: 'Connect a source before generating a report.' };
  }

  let data: GenerateResponse;
  try {
    const res = await fetch('/api/reports/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client: { name: state.clientName },
        period: { since: week.since.toISOString(), until: week.until.toISOString() },
        connections: state.connections,
        voice: {
          tone: state.tone,
          length: state.length,
          signoff: state.signoff,
          voiceSample: state.voiceSample,
        },
      }),
    });
    data = (await res.json()) as GenerateResponse;
  } catch {
    return { status: 'error', message: GENERIC_ERROR };
  }

  if (!data.ok) {
    return { status: 'error', message: data.error?.message ?? GENERIC_ERROR };
  }
  if (data.status === 'insufficient') {
    return { status: 'insufficient', reason: data.reason ?? 'Not enough activity this week.' };
  }
  if (data.status === 'drafted' && data.draft && data.periodLabel) {
    return {
      status: 'drafted',
      draft: data.draft,
      periodLabel: data.periodLabel,
      periodStart: week.periodStart,
      eventsUsed: data.eventsUsed ?? 0,
      sourceEvents: data.sourceEvents ?? [],
    };
  }
  return { status: 'error', message: GENERIC_ERROR };
}

export function OnboardingWizard() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(() => ({
    ...INITIAL_STATE,
    timezone: detectTimeZone(),
  }));
  const [step, setStep] = useState(1);
  const [view, setView] = useState<View>({ phase: 'steps' });
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const update = useCallback((patch: Partial<OnboardingState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const back = useCallback(() => setStep((n) => Math.max(1, n - 1)), []);
  const next = useCallback(() => setStep((n) => Math.min(4, n + 1)), []);

  const generate = useCallback(async () => {
    setView({ phase: 'generating' });
    const startedAt = Date.now();
    const week = previousReportWeek(new Date(), state.timezone);
    const outcome = await runGeneration(state, week);
    const wait = Math.max(0, MIN_GENERATING_MS - (Date.now() - startedAt));
    window.setTimeout(() => setView({ phase: 'result', outcome }), wait);
  }, [state]);

  const restartSteps = useCallback(() => setView({ phase: 'steps' }), []);

  /**
   * Commit the onboarded client: persist the client record + its first report,
   * then hand off to the dashboard. Only reachable from a drafted outcome.
   */
  const finishOnboarding = useCallback(async () => {
    if (view.phase !== 'result' || view.outcome.status !== 'drafted') return;
    if (state.connections.length === 0) return;
    const { outcome } = view;
    setFinishing(true);
    setFinishError(null);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: state.clientName,
          recipient: state.clientEmail,
          voice: {
            tone: state.tone,
            length: state.length,
            signoff: state.signoff,
            voiceSample: state.voiceSample,
          },
          cadence: { day: state.day, time: state.time, timezone: state.timezone },
          connections: state.connections,
          report: {
            periodStart: outcome.periodStart,
            periodLabel: outcome.periodLabel,
            eventsUsed: outcome.eventsUsed,
            draft: outcome.draft,
            sourceEvents: outcome.sourceEvents,
          },
        }),
      });
      if (!res.ok) {
        setFinishError(SAVE_ERROR);
        setFinishing(false);
        return;
      }
      router.push('/');
    } catch {
      setFinishError(SAVE_ERROR);
      setFinishing(false);
    }
  }, [view, state, router]);

  if (view.phase === 'generating') {
    return <Generating clientName={state.clientName} />;
  }

  if (view.phase === 'result') {
    const { outcome } = view;
    if (outcome.status === 'drafted') {
      return (
        <FirstDraft
          clientName={state.clientName}
          draft={outcome.draft}
          periodLabel={outcome.periodLabel}
          eventsUsed={outcome.eventsUsed}
          onFinish={finishOnboarding}
          finishing={finishing}
          error={finishError}
        />
      );
    }
    return (
      <GenerationNotice
        variant={outcome.status}
        message={outcome.status === 'insufficient' ? outcome.reason : outcome.message}
        onRetry={generate}
        onRestart={restartSteps}
      />
    );
  }

  return (
    <div className="w-full max-w-[31rem]">
      <WizardProgress current={step} />
      <div className="mt-10">
        {step === 1 ? <StepSelectClient state={state} update={update} onNext={next} /> : null}
        {step === 2 ? (
          <StepConnectSources state={state} update={update} onBack={back} onNext={next} />
        ) : null}
        {step === 3 ? (
          <StepSetVoice state={state} update={update} onBack={back} onNext={next} />
        ) : null}
        {step === 4 ? (
          <StepPickCadence state={state} update={update} onBack={back} onGenerate={generate} />
        ) : null}
      </div>
    </div>
  );
}
