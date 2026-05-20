import { CONNECTORS, type ConnectorMeta, type OnboardingState } from '@/lib/onboarding/types';
import { stagger } from '@/lib/style';
import { ConnectorGlyph } from './connector-glyphs';
import { ConnectorConnect } from './connector-connect';
import { WizardFooter } from './wizard-footer';

interface Props {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
  onBack: () => void;
  onNext: () => void;
}

/** A connector that isn't wired yet, shown so the PM sees what's coming. */
function SoonRow({ meta }: { meta: ConnectorMeta }) {
  return (
    <li className="flex items-center gap-4 py-4">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-sunk text-ink-faint">
        <ConnectorGlyph id={meta.id} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[0.95rem] font-medium text-ink-soft">{meta.name}</p>
        <p className="truncate text-[0.84rem] text-ink-faint">{meta.reads}</p>
      </div>
      <span className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[0.78rem] font-medium text-ink-faint">
        Soon
      </span>
    </li>
  );
}

export function StepConnectSources({ state, update, onBack, onNext }: Props) {
  const valid = state.connections.length > 0;

  return (
    <div className="anim-stagger">
      <header style={stagger(0)}>
        <h1 className="font-serif text-[1.95rem] leading-[1.15] tracking-[-0.018em] text-ink">
          Where does the work happen?
        </h1>
        <p className="mt-3 max-w-[40ch] text-[1rem] leading-relaxed text-ink-soft">
          Connect this client&rsquo;s project tool to pull their tasks and progress.
          Connect more than one if their work is spread across tools. We only ever
          read &mdash; never post, never change anything.
        </p>
      </header>

      <ul className="mt-7 divide-y divide-line border-y border-line" style={stagger(1)}>
        {CONNECTORS.map((meta) =>
          meta.available ? (
            <ConnectorConnect
              key={meta.id}
              meta={meta}
              connection={state.connections.find((c) => c.source === meta.id) ?? null}
              onConnected={(connection) =>
                update({
                  connections: [
                    ...state.connections.filter((c) => c.source !== meta.id),
                    connection,
                  ],
                })
              }
              onDisconnect={() =>
                update({ connections: state.connections.filter((c) => c.source !== meta.id) })
              }
            />
          ) : (
            <SoonRow key={meta.id} meta={meta} />
          ),
        )}
      </ul>

      <div style={stagger(2)}>
        <WizardFooter
          onBack={onBack}
          onNext={onNext}
          nextDisabled={!valid}
          hint={valid ? undefined : 'Connect at least one source to continue.'}
        />
      </div>
    </div>
  );
}
