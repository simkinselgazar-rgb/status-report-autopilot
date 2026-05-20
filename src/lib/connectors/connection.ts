/**
 * The bridge between a stored {@link SourceConnection} and a live connector.
 *
 * `sourceConnectionSchema` validates connections at API boundaries; the
 * factory turns one into the right {@link Connector} so the generate path
 * stays source-agnostic. No connection stores a refreshable token, token
 * connectors hold a long-lived pasted token, and Zoom mints its own from
 * Server-to-Server credentials, so there is no refresh step.
 *
 * Each connection holds an array of target ids: a client can track many
 * projects / channels / hosts per source. Persisted connections from before
 * the multi-target schema (a single `projectId`/`projectName`) are upgraded
 * to the array shape at parse time, so older deployments keep working.
 */

import { z } from 'zod';

import type { SourceConnection } from '@/lib/onboarding/types';
import { createAsanaConnector } from './asana';
import { createLinearConnector } from './linear';
import { createSlackConnector } from './slack';
import { createTeamsConnector, splitTeamsTarget } from './teams';
import type { Connector } from './types';
import { createZoomConnector } from './zoom';

/** The tracked targets, shared by every connection. */
const targetFields = {
  accountName: z.string(),
  workspaceName: z.string(),
  projectNames: z.array(z.string()),
  projectIds: z.array(z.string().min(1)).min(1, 'At least one tracked target is required.'),
};

/** Token connectors (Asana/Linear/Slack), a single pasted access token. */
const tokenField = {
  accessToken: z.string().min(1, 'A connection access token is required.'),
};

/** Zoom. Server-to-Server OAuth credentials the connector mints tokens from. */
const zoomFields = {
  accountId: z.string().min(1, 'A Zoom account id is required.'),
  clientId: z.string().min(1, 'A Zoom client id is required.'),
  clientSecret: z.string().min(1, 'A Zoom client secret is required.'),
};

/** Microsoft Teams. Entra app-only credentials the connector mints tokens from. */
const teamsFields = {
  tenantId: z.string().min(1, 'A Microsoft tenant id is required.'),
  clientId: z.string().min(1, 'A Microsoft client id is required.'),
  clientSecret: z.string().min(1, 'A Microsoft client secret is required.'),
};

const baseSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('asana'), ...targetFields, ...tokenField }),
  z.object({ source: z.literal('linear'), ...targetFields, ...tokenField }),
  z.object({ source: z.literal('slack'), ...targetFields, ...tokenField }),
  z.object({ source: z.literal('zoom'), ...targetFields, ...zoomFields }),
  z.object({ source: z.literal('teams'), ...targetFields, ...teamsFields }),
]);

/**
 * Upgrades a legacy single-target connection (`projectId` + `projectName`) to
 * the multi-target shape (`projectIds` + `projectNames`). Pass-through for
 * inputs that already carry the new shape or are not connection-shaped.
 */
function upgradeLegacyTarget(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  const obj = input as Record<string, unknown>;
  if (Array.isArray(obj.projectIds)) return obj;
  if (typeof obj.projectId === 'string' && obj.projectId.length > 0) {
    return {
      ...obj,
      projectIds: [obj.projectId],
      projectNames: typeof obj.projectName === 'string' ? [obj.projectName] : [''],
    };
  }
  return obj;
}

/** Zod schema for a persisted connection, discriminated on `source`. */
export const sourceConnectionSchema = z.preprocess(upgradeLegacyTarget, baseSchema);

/** Builds the live connector for a stored connection. */
export function createConnectorForConnection(connection: SourceConnection): Connector {
  switch (connection.source) {
    case 'asana':
      return createAsanaConnector({
        accessToken: connection.accessToken,
        projectGids: connection.projectIds,
      });
    case 'linear':
      return createLinearConnector({
        accessToken: connection.accessToken,
        projectIds: connection.projectIds,
      });
    case 'slack':
      return createSlackConnector({
        accessToken: connection.accessToken,
        channelIds: connection.projectIds,
      });
    case 'zoom':
      return createZoomConnector({
        accountId: connection.accountId,
        clientId: connection.clientId,
        clientSecret: connection.clientSecret,
        userIds: connection.projectIds,
      });
    case 'teams':
      return createTeamsConnector({
        tenantId: connection.tenantId,
        clientId: connection.clientId,
        clientSecret: connection.clientSecret,
        targets: connection.projectIds.map((id) => splitTeamsTarget(id)),
      });
  }
}
