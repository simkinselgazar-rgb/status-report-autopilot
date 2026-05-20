'use client';

import { useState, type ReactNode } from 'react';

import type { ConnectorMeta, SourceConnection } from '@/lib/onboarding/types';
import { Button } from '@/components/ui/button';
import { ConnectorGlyph } from './connector-glyphs';
import { CheckIcon } from './icons';

interface Workspace {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
}

/** The pasted credential values, keyed by `CredentialField.key`. */
type Credentials = Record<string, string>;

type VerifyResponse =
  | { ok: true; identity: { accountName: string; workspaces: Workspace[] } }
  | { ok: false; error: { message: string } };

type ProjectsResponse =
  | { ok: true; projects: Project[] }
  | { ok: false; error: { message: string } };

type Phase =
  | { kind: 'idle'; error: string | null }
  /** The paste-your-credentials panel. */
  | { kind: 'credentials'; values: Credentials; verifying: boolean; error: string | null }
  | {
      kind: 'project';
      credentials: Credentials;
      accountName: string;
      workspaces: Workspace[];
      workspaceId: string;
      /** `null` while a project list is loading. */
      projects: Project[] | null;
      projectId: string;
      error: string | null;
    }
  | { kind: 'connected'; connection: SourceConnection };

type ProjectPhase = Extract<Phase, { kind: 'project' }>;
type CredentialsPhase = Extract<Phase, { kind: 'credentials' }>;

const NETWORK_ERROR = "We couldn't reach the server, check your connection and try again.";

interface Props {
  meta: ConnectorMeta;
  connection: SourceConnection | null;
  onConnected: (connection: SourceConnection) => void;
  onDisconnect: () => void;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

/** True once every credential field has a non-empty value. */
function allFilled(meta: ConnectorMeta, values: Credentials): boolean {
  return meta.credentials.fields.every((field) => (values[field.key] ?? '').trim().length > 0);
}

/**
 * A connector row in the connect step, an inline, expandable connect flow:
 * "Connect" opens a paste-your-credentials panel (one field for a token
 * connector, several for Zoom), then verify → pick a workspace/project →
 * connected. Source-agnostic, driven entirely off `meta`.
 */
export function ConnectorConnect({ meta, connection, onConnected, onDisconnect }: Props) {
  const [phase, setPhase] = useState<Phase>(
    connection ? { kind: 'connected', connection } : { kind: 'idle', error: null },
  );

  // Not every source tracks a "project", pick the noun the picker uses.
  const projectNoun =
    meta.id === 'slack' || meta.id === 'teams'
      ? 'channel'
      : meta.id === 'zoom'
        ? 'host'
        : 'project';
  const panelOpen = phase.kind === 'credentials' || phase.kind === 'project';

  function cancel() {
    setPhase({ kind: 'idle', error: null });
  }

  function startConnect() {
    setPhase({ kind: 'credentials', values: {}, verifying: false, error: null });
  }

  function setCredentialValue(key: string, value: string) {
    setPhase((p) =>
      p.kind === 'credentials'
        ? { ...p, values: { ...p.values, [key]: value }, error: null }
        : p,
    );
  }

  /** Verify the pasted credentials, then load the source's projects. */
  async function submitCredentials() {
    if (phase.kind !== 'credentials') return;
    const { values } = phase;
    if (!allFilled(meta, values) || phase.verifying) return;
    setPhase({ kind: 'credentials', values, verifying: true, error: null });

    let data: VerifyResponse;
    try {
      data = await postJson<VerifyResponse>(`/api/connectors/${meta.id}/verify`, values);
    } catch {
      setPhase({ kind: 'credentials', values, verifying: false, error: NETWORK_ERROR });
      return;
    }
    if (!data.ok) {
      setPhase({ kind: 'credentials', values, verifying: false, error: data.error.message });
      return;
    }
    if (data.identity.workspaces.length === 0) {
      setPhase({
        kind: 'credentials',
        values,
        verifying: false,
        error: `No ${meta.name} workspaces were found for these credentials.`,
      });
      return;
    }
    const { accountName, workspaces } = data.identity;
    await loadProjects(values, accountName, workspaces, workspaces[0]!.id);
  }

  async function loadProjects(
    credentials: Credentials,
    accountName: string,
    workspaces: Workspace[],
    workspaceId: string,
  ) {
    const base = {
      kind: 'project' as const,
      credentials,
      accountName,
      workspaces,
      workspaceId,
      projectId: '',
    };
    setPhase({ ...base, projects: null, error: null });

    let data: ProjectsResponse;
    try {
      data = await postJson<ProjectsResponse>(`/api/connectors/${meta.id}/projects`, {
        ...credentials,
        workspaceId,
      });
    } catch {
      setPhase({ ...base, projects: [], error: NETWORK_ERROR });
      return;
    }

    if (!data.ok) {
      setPhase({ ...base, projects: [], error: data.error.message });
      return;
    }
    setPhase({ ...base, projects: data.projects, error: null });
  }

  function selectProject(id: string) {
    setPhase((p) => (p.kind === 'project' ? { ...p, projectId: id } : p));
  }

  function finalize(p: ProjectPhase) {
    const project = p.projects?.find((pr) => pr.id === p.projectId);
    if (!project) return;
    const workspace = p.workspaces.find((w) => w.id === p.workspaceId);
    // `ConnectorConnect` only renders for workspace/project sources; the
    // credential values carry the source-specific keys (accessToken, or the
    // Zoom triple), validated server-side by the connection schema.
    const next = {
      source: meta.id,
      accountName: p.accountName,
      workspaceName: workspace?.name ?? '',
      projectId: project.id,
      projectName: project.name,
      ...p.credentials,
    } as SourceConnection;
    onConnected(next);
    setPhase({ kind: 'connected', connection: next });
  }

  function disconnect() {
    onDisconnect();
    setPhase({ kind: 'idle', error: null });
  }

  const idleError = phase.kind === 'idle' ? phase.error : null;

  return (
    <li>
      <div className="flex items-center gap-4 py-4">
        <div
          className={`grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-300 ease-out ${
            phase.kind === 'connected' ? 'bg-pine-soft text-pine' : 'bg-sunk text-ink-soft'
          }`}
        >
          <ConnectorGlyph id={meta.id} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[0.95rem] font-medium text-ink">{meta.name}</p>
          {phase.kind === 'connected' ? (
            <p className="truncate text-[0.84rem] text-ink-faint">
              Tracking {phase.connection.projectName}
            </p>
          ) : idleError ? (
            <p className="text-[0.84rem] leading-relaxed text-danger anim-fade">{idleError}</p>
          ) : (
            <p className="truncate text-[0.84rem] text-ink-faint">{meta.reads}</p>
          )}
        </div>

        {phase.kind === 'connected' ? (
          <div className="flex items-center gap-1">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-pine-soft px-2.5 py-1.5 text-[0.82rem] font-medium text-pine-ink anim-fade">
              <CheckIcon />
              Connected
            </span>
            <Button variant="ghost" size="sm" onClick={disconnect}>
              Change
            </Button>
          </div>
        ) : panelOpen ? null : (
          <Button variant="ghost" size="sm" onClick={startConnect} className="border border-line">
            {idleError ? 'Try again' : 'Connect'}
          </Button>
        )}
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          panelOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="pb-5 pl-14">
            {phase.kind === 'credentials' ? (
              <CredentialPanel
                meta={meta}
                phase={phase}
                onChange={setCredentialValue}
                onSubmit={() => void submitCredentials()}
                onCancel={cancel}
              />
            ) : null}
            {phase.kind === 'project'
              ? renderProjectPanel(phase, { loadProjects, selectProject, finalize, cancel }, projectNoun)
              : null}
          </div>
        </div>
      </div>
    </li>
  );
}

// --- panels ----------------------------------------------------------------

/** The paste-your-credentials panel, one or more fields, from `meta`. */
function CredentialPanel({
  meta,
  phase,
  onChange,
  onSubmit,
  onCancel,
}: {
  meta: ConnectorMeta;
  phase: CredentialsPhase;
  onChange: (key: string, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { fields, url, hint } = meta.credentials;
  const fieldClasses =
    'mt-2 h-11 w-full rounded-xl border border-line bg-sunk px-4 text-[0.95rem] text-ink transition-[border-color,background-color] duration-150 ease-out hover:border-line-strong focus:border-line-strong focus:bg-surface focus:outline-2 focus:outline-offset-2 focus:outline-focus';

  return (
    <div className="anim-fade">
      {fields.map((field, index) => {
        const inputId = `${meta.id}-${field.key}`;
        return (
          <div key={field.key} className={index > 0 ? 'mt-3' : ''}>
            <label htmlFor={inputId} className="block text-[0.82rem] font-medium text-ink-soft">
              {field.label}
            </label>
            <input
              id={inputId}
              type={field.secret ? 'password' : 'text'}
              value={phase.values[field.key] ?? ''}
              autoFocus={index === 0}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => onChange(field.key, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onSubmit();
              }}
              placeholder={`Paste your ${field.label.toLowerCase()}`}
              className={fieldClasses}
            />
          </div>
        );
      })}

      <p className="mt-2 text-[0.8rem] leading-relaxed text-ink-faint">
        {hint}{' '}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-ink-soft underline underline-offset-2 transition-colors duration-150 ease-out hover:text-ink"
        >
          Where to find these →
        </a>
      </p>

      {phase.error ? <ErrorLine>{phase.error}</ErrorLine> : null}

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={!allFilled(meta, phase.values) || phase.verifying}
        >
          {phase.verifying ? 'Verifying…' : 'Connect'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function renderProjectPanel(
  p: ProjectPhase,
  actions: {
    loadProjects: (
      credentials: Credentials,
      accountName: string,
      workspaces: Workspace[],
      workspaceId: string,
    ) => void;
    selectProject: (id: string) => void;
    finalize: (p: ProjectPhase) => void;
    cancel: () => void;
  },
  /** What the picked thing is called, "project" / "channel" / "host". */
  noun: string,
) {
  const loading = p.projects === null;
  const noProjects = p.projects !== null && p.projects.length === 0;
  const Noun = `${noun[0]!.toUpperCase()}${noun.slice(1)}`;

  return (
    <div className="anim-fade">
      <p className="flex items-center gap-1.5 text-[0.84rem] font-medium text-pine-ink">
        <CheckIcon />
        Connected as {p.accountName}
      </p>

      {p.workspaces.length > 1 ? (
        <div className="mt-3">
          <label className="block text-[0.82rem] font-medium text-ink-soft">Workspace</label>
          <SelectField
            value={p.workspaceId}
            disabled={loading}
            onChange={(id) => actions.loadProjects(p.credentials, p.accountName, p.workspaces, id)}
          >
            {p.workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </SelectField>
        </div>
      ) : null}

      <div className="mt-3">
        <label className="block text-[0.82rem] font-medium text-ink-soft">{Noun} to track</label>
        {loading ? (
          <p className="mt-2 flex h-11 items-center text-[0.9rem] text-ink-faint">
            Loading {noun}s…
          </p>
        ) : noProjects ? (
          <p className="mt-2 text-[0.9rem] text-ink-faint">
            No active {noun}s in this workspace.
          </p>
        ) : (
          <SelectField value={p.projectId} onChange={actions.selectProject}>
            <option value="" disabled>
              Choose a {noun}…
            </option>
            {p.projects!.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </SelectField>
        )}
      </div>

      {p.error ? (
        <ErrorLine>
          {p.error}{' '}
          <button
            type="button"
            onClick={() =>
              actions.loadProjects(p.credentials, p.accountName, p.workspaces, p.workspaceId)
            }
            className="underline underline-offset-2 hover:text-ink"
          >
            Try again
          </button>
        </ErrorLine>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={() => actions.finalize(p)} disabled={p.projectId.length === 0}>
          Use this {noun}
        </Button>
        <Button variant="ghost" size="sm" onClick={actions.cancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// --- small parts -----------------------------------------------------------

function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-[0.8rem] leading-relaxed text-danger anim-fade">{children}</p>
  );
}

function SelectField({
  value,
  onChange,
  disabled = false,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative mt-2">
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-xl border border-line bg-sunk pl-4 pr-10 text-[0.95rem] text-ink transition-[border-color,background-color] duration-150 ease-out focus:border-line-strong focus:bg-surface focus:outline-2 focus:outline-offset-2 focus:outline-focus disabled:opacity-50"
      >
        {children}
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
  );
}
