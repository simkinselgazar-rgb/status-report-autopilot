'use client';

import { authClient } from '@/lib/auth/client';

/** A quiet sign-out control for the dashboard chrome. */
export function SignOutButton() {
  async function signOut() {
    await authClient.signOut();
    window.location.href = '/sign-in';
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="text-[0.78rem] text-ink-faint underline-offset-2 transition-colors duration-150 ease-out hover:text-ink-soft hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      Sign out
    </button>
  );
}
