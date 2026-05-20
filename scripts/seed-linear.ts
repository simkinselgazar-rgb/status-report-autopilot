/**
 * Linear seed, creates a project + a few issues so smoke-connector.ts has
 * something real to fetch for fetchActivity.
 *
 * Run once after creating an empty team in Linear:
 *
 *   npm exec tsx scripts/seed-linear.ts -- --team=<teamId> [--project-name="Smoke test"]
 *
 * Requires LINEAR_TOKEN in .env. The token used to seed must have write
 * scope; rotate to read-only afterward for the actual connector test.
 */

import 'dotenv/config';

interface Args {
  teamId: string;
  projectName: string;
}

function parseArgs(): Args {
  let teamId: string | undefined;
  let projectName = 'Smoke test';
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    const [key, value] = raw.slice(2).split('=', 2);
    if (key === 'team') teamId = value;
    else if (key === 'project-name' && value) projectName = value;
  }
  if (!teamId) {
    console.error('--team=<teamId> is required (run smoke-connector.ts to discover it).');
    process.exit(1);
  }
  return { teamId, projectName };
}

const token = process.env.LINEAR_TOKEN?.trim();
if (!token) {
  console.error('Missing LINEAR_TOKEN in .env.');
  process.exit(1);
}
const authHeader = token.startsWith('lin_oauth_') ? `Bearer ${token}` : token;

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) {
    throw new Error(`Linear: ${body.errors.map((e) => e.message).join('; ')}`);
  }
  if (!body.data) throw new Error('Linear: empty response');
  return body.data;
}

const PROJECT_CREATE = `mutation ProjectCreate($input: ProjectCreateInput!) {
  projectCreate(input: $input) { success project { id name } }
}`;

const ISSUE_CREATE = `mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { id identifier title } }
}`;

interface SeedIssue {
  title: string;
  description: string;
}

const ISSUES: SeedIssue[] = [
  {
    title: 'Wire the new pricing card',
    description: 'Three tiers, the middle one is highlighted.',
  },
  {
    title: 'Fix focus ring on the channel picker',
    description: 'The focus ring was getting clipped on Safari.',
  },
  {
    title: 'Write the kickoff brief for the new client',
    description: 'One pager, brand voice, weekly cadence + Friday delivery.',
  },
];

async function main(): Promise<void> {
  const { teamId, projectName } = parseArgs();

  console.log(`\n— seed-linear (team=${teamId}) —`);

  const project = await graphql<{
    projectCreate: { success: boolean; project: { id: string; name: string } };
  }>(PROJECT_CREATE, { input: { name: projectName, teamIds: [teamId] } });
  if (!project.projectCreate.success) throw new Error('projectCreate returned success=false');
  const { id: projectId, name } = project.projectCreate.project;
  console.log(`✓ Project: ${name}   --project=${projectId}`);

  for (const issue of ISSUES) {
    const created = await graphql<{
      issueCreate: { success: boolean; issue: { id: string; identifier: string; title: string } };
    }>(ISSUE_CREATE, {
      input: {
        teamId,
        projectId,
        title: issue.title,
        description: issue.description,
      },
    });
    if (!created.issueCreate.success) throw new Error(`issueCreate failed for "${issue.title}"`);
    console.log(`  + ${created.issueCreate.issue.identifier}  ${created.issueCreate.issue.title}`);
  }

  console.log(`\nDone. Now run:\n  npm exec tsx scripts/smoke-connector.ts -- --source=linear --project=${projectId}`);
}

main().catch((error) => {
  console.error(`\nfailed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
