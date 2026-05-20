import { redirect } from 'next/navigation';

import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { getSession } from '@/lib/auth/session';
import { hasConfiguredModel } from '@/lib/models/config';

/** Gates on the session on every request, never prerendered. */
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  if (!(await getSession())) redirect('/sign-in');
  // Adding a client kicks off generation, finish first-run model setup first.
  if (!(await hasConfiguredModel())) redirect('/setup');

  return <OnboardingWizard />;
}
