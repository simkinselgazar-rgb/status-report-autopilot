/**
 * Per-connector smoke test, hits the real API with a real token.
 *
 * Three depths, run in order:
 *
 *   1. Verify  (no --workspace)
 *        Calls verify() and prints the account name + workspaces.
 *
 *   2. List projects  (--workspace=<id>)
 *        Calls listProjects(workspace) and prints every connectable target.
 *
 *   3. Fetch activity  (--project=<id>)
 *        Calls fetchActivity({ since: now-7d, until: now }) and prints
 *        a digest summary (event count, warnings, first events).
 *
 * Credentials are read from env (loaded from .env via dotenv/config):
 *   - asana   ASANA_TOKEN
 *   - linear  LINEAR_TOKEN
 *   - slack   SLACK_TOKEN
 *   - zoom    ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
 *   - teams   TEAMS_TENANT_ID, TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET
 *
 * Example:
 *   npm exec tsx scripts/smoke-connector.ts -- --source=asana
 *   npm exec tsx scripts/smoke-connector.ts -- --source=asana --workspace=12345
 *   npm exec tsx scripts/smoke-connector.ts -- --source=asana --project=67890
 *
 * For Teams, --project takes the composite `teamId|channelId` (which is
 * exactly what listProjects returns).
 */

import 'dotenv/config';

import { createAsanaConnector } from '../src/lib/connectors/asana';
import { createLinearConnector } from '../src/lib/connectors/linear';
import { createSlackConnector } from '../src/lib/connectors/slack';
import { createTeamsConnector, splitTeamsTarget } from '../src/lib/connectors/teams';
import { createZoomConnector } from '../src/lib/connectors/zoom';
import type {
  ActivityDigest,
  Connector,
  ConnectorIdentity,
  ConnectorWorkspace,
  SourceEvent,
} from '../src/lib/connectors/types';

type SourceId = 'asana' | 'linear' | 'slack' | 'zoom' | 'teams';

interface Args {
  source: SourceId;
  workspace?: string;
  project?: string;
}

interface ConnectorWithLists extends Connector {
  listWorkspaces?(): Promise<ConnectorWorkspace[]>;
  listProjects?(workspaceId: string): Promise<{ id?: string; gid?: string; name: string }[]>;
}

function parseArgs(): Args {
  const out: Partial<Args> = {};
  for (const raw of process.argv.slice(2)) {
    const [key, value] = raw.startsWith('--') ? raw.slice(2).split('=', 2) : [];
    if (!key) continue;
    if (key === 'source') out.source = value as SourceId;
    else if (key === 'workspace') out.workspace = value;
    else if (key === 'project' || key === 'target') out.project = value;
  }
  if (!out.source) {
    fail('--source is required (asana | linear | slack | zoom | teams).');
  }
  if (!['asana', 'linear', 'slack', 'zoom', 'teams'].includes(out.source!)) {
    fail(`Unknown source "${out.source}".`);
  }
  return out as Args;
}

function need(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) fail(`Missing env var ${key}. Set it in .env or your shell.`);
  return value!;
}

function buildConnector(args: Args): ConnectorWithLists {
  const projectIds = args.project ? [args.project] : undefined;
  switch (args.source) {
    case 'asana':
      return createAsanaConnector({
        accessToken: need('ASANA_TOKEN'),
        projectGids: projectIds,
      }) as ConnectorWithLists;
    case 'linear':
      return createLinearConnector({
        accessToken: need('LINEAR_TOKEN'),
        projectIds,
      }) as ConnectorWithLists;
    case 'slack':
      return createSlackConnector({
        accessToken: need('SLACK_TOKEN'),
        channelIds: projectIds,
      }) as ConnectorWithLists;
    case 'zoom':
      return createZoomConnector({
        accountId: need('ZOOM_ACCOUNT_ID'),
        clientId: need('ZOOM_CLIENT_ID'),
        clientSecret: need('ZOOM_CLIENT_SECRET'),
        userIds: projectIds,
      }) as ConnectorWithLists;
    case 'teams':
      return createTeamsConnector({
        tenantId: need('TEAMS_TENANT_ID'),
        clientId: need('TEAMS_CLIENT_ID'),
        clientSecret: need('TEAMS_CLIENT_SECRET'),
        targets: args.project ? [splitTeamsTarget(args.project)] : undefined,
      }) as ConnectorWithLists;
  }
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function printIdentity(identity: ConnectorIdentity): void {
  console.log(`✓ Connected as ${identity.accountName}${identity.accountEmail ? ` <${identity.accountEmail}>` : ''}`);
  if (identity.workspaces.length === 0) {
    console.log('  (no workspaces visible to this credential)');
    return;
  }
  console.log(`  ${identity.workspaces.length} workspace${identity.workspaces.length === 1 ? '' : 's'}:`);
  for (const ws of identity.workspaces) {
    console.log(`    - ${ws.name}   --workspace=${ws.id}`);
  }
}

function printProjects(
  source: SourceId,
  projects: { id?: string; gid?: string; name: string }[],
): void {
  if (projects.length === 0) {
    console.log('  (no projects/channels/hosts found)');
    return;
  }
  const noun =
    source === 'slack' || source === 'teams'
      ? 'channel'
      : source === 'zoom'
        ? 'host'
        : 'project';
  console.log(`✓ ${projects.length} ${noun}${projects.length === 1 ? '' : 's'} found:`);
  for (const p of projects) {
    const id = p.id ?? p.gid ?? '';
    console.log(`    - ${p.name}   --project=${id}`);
  }
}

function printDigest(digest: ActivityDigest): void {
  console.log(`✓ Window: ${digest.window.since.toISOString()} → ${digest.window.until.toISOString()}`);
  console.log(`  Items scanned: ${digest.stats.itemsScanned}`);
  console.log(`  Events found: ${digest.stats.eventsFound}`);
  if (digest.warnings.length > 0) {
    console.log(`  Warnings (${digest.warnings.length}):`);
    for (const warning of digest.warnings) console.log(`    ! ${warning}`);
  }
  const sample = digest.events.slice(0, 5);
  if (sample.length > 0) {
    console.log(`  First ${sample.length} event${sample.length === 1 ? '' : 's'}:`);
    for (const event of sample) console.log(`    - [${event.kind}] ${eventLine(event)}`);
  }
}

function eventLine(event: SourceEvent): string {
  const when = event.timestamp.slice(0, 16).replace('T', ' ');
  const who = event.actor ? ` by ${event.actor}` : '';
  const detail = event.detail ? `: ${event.detail.slice(0, 80)}${event.detail.length > 80 ? '…' : ''}` : '';
  return `${when} · ${event.title}${who}${detail}`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const connector = buildConnector(args);

  console.log(`\n— smoke-connector(${args.source}) —`);

  if (args.project) {
    // Depth 3: fetchActivity over the past 7 days.
    const now = new Date();
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const digest = await connector.fetchActivity({ since, until: now });
    printDigest(digest);
    return;
  }

  // Depth 1: always verify.
  const identity = await connector.verify();
  printIdentity(identity);

  if (args.workspace) {
    // Depth 2: list projects/channels/hosts in the chosen workspace.
    if (!connector.listProjects) {
      fail(`${args.source} does not support listProjects.`);
    }
    const projects = await connector.listProjects(args.workspace);
    printProjects(args.source, projects);
  }
}

main().catch((error) => {
  console.error(`\nfailed: ${error instanceof Error ? error.message : String(error)}`);
  if (error && typeof error === 'object' && 'code' in error) {
    console.error(`code: ${(error as { code: unknown }).code}`);
  }
  process.exit(1);
});
