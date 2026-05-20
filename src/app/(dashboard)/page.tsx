import { redirect } from 'next/navigation';

import { Dashboard } from '@/components/dashboard/dashboard';
import { getSession } from '@/lib/auth/session';
import { listReports } from '@/lib/db/queries';
import { hasConfiguredModel } from '@/lib/models/config';

/** Reads the product DB on every request, never statically prerendered. */
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  if (!(await getSession())) redirect('/sign-in');
  // First-run gate: no model means generation can't run, so finish setup first.
  if (!(await hasConfiguredModel())) redirect('/setup');

  const reports = await listReports();
  return <Dashboard initialReports={reports} />;
}
