/**
 * The bridge between a stored {@link SourceConnection} and a live connector.
 *
 * `sourceConnectionSchema` validates connections at API boundaries; the
 * factory turns one into the right {@link Connector} so the generate path
 * stays source-agnostic. No connection stores a refreshable token, token
 * connectors hold a long-lived pasted token, and Zoom mints its own from
 * Server-to-Server credentials, so there is no refresh step.
 */

import { z } from 'zod';

import type { SourceConnection } from '@/lib/onboarding/types';
import { createAsanaConnector } from './asana';
import { createLinearConnector } from './linear';
import { createSlackConnector } from './slack';
import { createTeamsConnector, splitTeamsTarget } from './teams';
import type { Connector } from './types';
import { createZoomConnector } from './zoom';

/** The tracked target, shared by every connection. */
const targetFields = {
  accountName: z.string(),
  workspaceName: z.string(),
  projectName: z.string(),
  projectId: z.string().min(1, 'A connected project is required.'),
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

/** Zod schema for a persisted connection, discriminated on `source`. */
export const sourceConnectionSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('asana'), ...targetFields, ...tokenField }),
  z.object({ source: z.literal('linear'), ...targetFields, ...tokenField }),
  z.object({ source: z.literal('slack'), ...targetFields, ...tokenField }),
  z.object({ source: z.literal('zoom'), ...targetFields, ...zoomFields }),
  z.object({ source: z.literal('teams'), ...targetFields, ...teamsFields }),
]);

/** Builds the live connector for a stored connection. */
export function createConnectorForConnection(connection: SourceConnection): Connector {
  switch (connection.source) {
    case 'asana':
      return createAsanaConnector({
        accessToken: connection.accessToken,
        projectGid: connection.projectId,
      });
    case 'linear':
      return createLinearConnector({
        accessToken: connection.accessToken,
        projectId: connection.projectId,
      });
    case 'slack':
      return createSlackConnector({
        accessToken: connection.accessToken,
        channelId: connection.projectId,
      });
    case 'zoom':
      return createZoomConnector({
        accountId: connection.accountId,
        clientId: connection.clientId,
        clientSecret: connection.clientSecret,
        userId: connection.projectId,
      });
    case 'teams': {
      const { teamId, channelId } = splitTeamsTarget(connection.projectId);
      return createTeamsConnector({
        tenantId: connection.tenantId,
        clientId: connection.clientId,
        clientSecret: connection.clientSecret,
        teamId,
        channelId,
      });
    }
  }
}
