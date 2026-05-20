/**
 * Asana seed, creates a project + a few tasks (with stories) so
 * smoke-connector.ts and the full report end-to-end test have controlled
 * data to work against.
 *
 * Run after picking a workspace via smoke-connector.ts:
 *
 *   npm exec tsx scripts/seed-asana.ts -- --workspace=<gid> [--project-name="Smoke test"]
 *
 * Requires ASANA_TOKEN in .env. The token must have its usual full-account
 * Asana PAT permissions (Asana does not let you scope a PAT to read-only,
 * so an existing PAT is sufficient).
 */

import 'dotenv/config';

interface Args {
  workspaceGid: string;
  projectName: string;
}

function parseArgs(): Args {
  let workspaceGid: string | undefined;
  let projectName = 'Smoke test';
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    const [key, value] = raw.slice(2).split('=', 2);
    if (key === 'workspace') workspaceGid = value;
    else if (key === 'project-name' && value) projectName = value;
  }
  if (!workspaceGid) {
    console.error('--workspace=<gid> is required (run smoke-connector.ts to discover it).');
    process.exit(1);
  }
  return { workspaceGid, projectName };
}

const token = process.env.ASANA_TOKEN?.trim();
if (!token) {
  console.error('Missing ASANA_TOKEN in .env.');
  process.exit(1);
}

const API_BASE = 'https://app.asana.com/api/1.0';

async function asana<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify({ data: body }) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Asana ${method} ${path} (${res.status}): ${text}`);
  return JSON.parse(text) as T;
}

interface SeedTask {
  name: string;
  notes: string;
  comment: string;
  completed?: boolean;
  milestone?: boolean;
}

const TASKS: SeedTask[] = [
  {
    name: 'Wire the new pricing card',
    notes: 'Three tiers, the middle one is highlighted.',
    comment: 'Shipped the layout. Copy is locked.',
    completed: true,
  },
  {
    name: 'Fix focus ring on the channel picker',
    notes: 'The focus ring was getting clipped on Safari.',
    comment: 'In review. Will land Friday.',
  },
  {
    name: 'Q3 launch milestone',
    notes: 'Public press release + the open-source repo announcement.',
    comment: 'On track.',
    milestone: true,
  },
];

async function main(): Promise<void> {
  const { workspaceGid, projectName } = parseArgs();

  console.log(`\n— seed-asana (workspace=${workspaceGid}) —`);

  const project = await asana<{ data: { gid: string; name: string } }>('POST', '/projects', {
    workspace: workspaceGid,
    name: projectName,
    layout: 'list',
  });
  console.log(`✓ Project: ${project.data.name}   --project=${project.data.gid}`);

  for (const task of TASKS) {
    const created = await asana<{ data: { gid: string; name: string } }>('POST', '/tasks', {
      workspace: workspaceGid,
      projects: [project.data.gid],
      name: task.name,
      notes: task.notes,
      ...(task.completed ? { completed: true } : {}),
      ...(task.milestone ? { resource_subtype: 'milestone' } : {}),
    });
    console.log(`  + ${created.data.gid}  ${created.data.name}`);
    // Add a comment story so the connector sees commentary, not just task fields.
    await asana('POST', `/tasks/${created.data.gid}/stories`, { text: task.comment });
  }

  console.log(`\nDone. Now run:\n  npm exec tsx scripts/smoke-connector.ts -- --source=asana --project=${project.data.gid}`);
}

main().catch((error) => {
  console.error(`\nfailed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
