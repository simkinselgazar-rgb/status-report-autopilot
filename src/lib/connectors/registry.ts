/**
 * The connector registry, the source-keyed table the connect-step API routes
 * (`/api/connectors/[source]/{verify,projects}`) drive off.
 *
 * Each entry pairs a credentials schema (what the wizard pastes) with a factory
 * that builds the connector and exposes the two operations the connect step
 * needs: `verify` and `listProjects` (normalized to `{ id, name }`).
 */

import { z } from 'zod';

import { createAsanaConnector } from './asana';
import { createLinearConnector } from './linear';
import { createSlackConnector } from './slack';
import { createTeamsConnector } from './teams';
import type { ConnectorIdentity, SourceId } from './types';
import { createZoomConnector } from './zoom';

/** A pickable target, what `listProjects` returns to the connect step. */
export interface ConnectorTarget {
  id: string;
  name: string;
}

export interface ConnectorEntry {
  /** Schema for the credentials the wizard pastes for this source. */
  credentials: z.ZodType<Record<string, string>>;
  /** Builds the connect-step operations from validated credentials. */
  create(credentials: Record<string, string>): {
    verify(): Promise<ConnectorIdentity>;
    listProjects(workspaceId: string): Promise<ConnectorTarget[]>;
  };
}

/** Token connectors (Asana / Linear / Slack), a single pasted access token. */
const tokenCredentials = z.object({
  accessToken: z.string().min(1, 'An access token is required.'),
});

/** Zoom, a Server-to-Server OAuth credential triple. */
const zoomCredentials = z.object({
  accountId: z.string().min(1, 'A Zoom account id is required.'),
  clientId: z.string().min(1, 'A Zoom client id is required.'),
  clientSecret: z.string().min(1, 'A Zoom client secret is required.'),
});

/** Microsoft Teams, an Entra app-only credential triple. */
const teamsCredentials = z.object({
  tenantId: z.string().min(1, 'A Microsoft tenant id is required.'),
  clientId: z.string().min(1, 'A Microsoft client id is required.'),
  clientSecret: z.string().min(1, 'A Microsoft client secret is required.'),
});

export const CONNECTOR_REGISTRY: Record<SourceId, ConnectorEntry> = {
  asana: {
    credentials: tokenCredentials,
    create: (c) => {
      const connector = createAsanaConnector({ accessToken: c.accessToken! });
      return {
        verify: () => connector.verify(),
        // Asana projects key on `gid`; normalize to the shared `{ id, name }`.
        listProjects: async (workspaceId) =>
          (await connector.listProjects(workspaceId)).map((p) => ({ id: p.gid, name: p.name })),
      };
    },
  },
  linear: {
    credentials: tokenCredentials,
    create: (c) => {
      const connector = createLinearConnector({ accessToken: c.accessToken! });
      return { verify: () => connector.verify(), listProjects: (w) => connector.listProjects(w) };
    },
  },
  slack: {
    credentials: tokenCredentials,
    create: (c) => {
      const connector = createSlackConnector({ accessToken: c.accessToken! });
      return { verify: () => connector.verify(), listProjects: (w) => connector.listProjects(w) };
    },
  },
  zoom: {
    credentials: zoomCredentials,
    create: (c) => {
      const connector = createZoomConnector({
        accountId: c.accountId!,
        clientId: c.clientId!,
        clientSecret: c.clientSecret!,
      });
      return { verify: () => connector.verify(), listProjects: (w) => connector.listProjects(w) };
    },
  },
  teams: {
    credentials: teamsCredentials,
    create: (c) => {
      const connector = createTeamsConnector({
        tenantId: c.tenantId!,
        clientId: c.clientId!,
        clientSecret: c.clientSecret!,
      });
      return { verify: () => connector.verify(), listProjects: (w) => connector.listProjects(w) };
    },
  },
};

/** Looks up a registry entry for a raw `[source]` route param. */
export function connectorEntry(source: string): ConnectorEntry | undefined {
  return CONNECTOR_REGISTRY[source as SourceId];
}
