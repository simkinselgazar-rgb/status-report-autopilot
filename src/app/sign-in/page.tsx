'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';
import { stagger } from '@/lib/style';

type Mode = 'signin' | 'signup';

const FIELD_CLASSES =
  'mt-2 h-11 w-full rounded-xl border border-line bg-sunk px-4 text-[0.95rem] text-ink ' +
  'transition-[border-color,background-color] duration-150 ease-out hover:border-line-strong ' +
  'focus:border-line-strong focus:bg-surface focus:outline-2 focus:outline-offset-2 focus:outline-focus';

export default function SignInPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === 'signup';

  function switchMode() {
    setMode(isSignup ? 'signin' : 'signup');
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    const result = isSignup
      ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
      : await authClient.signIn.email({ email: email.trim(), password });

    if (result.error) {
      setError(result.error.message ?? 'Something went wrong. Please try again.');
      setPending(false);
      return;
    }
    window.location.href = '/';
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
      <div className="w-full max-w-[25rem] anim-stagger">
        <header style={stagger(0)}>
          <p className="text-[0.78rem] font-medium uppercase tracking-[0.14em] text-ink-faint">
            Status Report Autopilot
          </p>
          <h1 className="mt-3 font-serif text-[2rem] leading-[1.12] tracking-[-0.02em] text-ink">
            {isSignup ? 'Create your account' : 'Sign in'}
          </h1>
          <p className="mt-3 max-w-[34ch] text-[1rem] leading-relaxed text-ink-soft">
            {isSignup
              ? 'Set up the account your team will use to review and ship reports.'
              : 'Open the dashboard to pick up this week’s drafts.'}
          </p>
        </header>

        <form onSubmit={submit} className="mt-8" style={stagger(1)} noValidate>
          {isSignup ? (
            <div>
              <label htmlFor="name" className="block text-[0.82rem] font-medium text-ink-soft">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                className={FIELD_CLASSES}
              />
            </div>
          ) : null}

          <div className={isSignup ? 'mt-4' : ''}>
            <label htmlFor="email" className="block text-[0.82rem] font-medium text-ink-soft">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              className={FIELD_CLASSES}
            />
          </div>

          <div className="mt-4">
            <label htmlFor="password" className="block text-[0.82rem] font-medium text-ink-soft">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              onChange={(event) => setPassword(event.target.value)}
              className={FIELD_CLASSES}
            />
            {isSignup ? (
              <p className="mt-1.5 text-[0.8rem] leading-relaxed text-ink-faint">
                At least 8 characters.
              </p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="mt-4 text-[0.84rem] leading-relaxed text-danger anim-fade">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="mt-5 w-full">
            {pending
              ? isSignup
                ? 'Creating account…'
                : 'Signing in…'
              : isSignup
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-[0.84rem] leading-relaxed text-ink-soft" style={stagger(2)}>
          {isSignup ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            onClick={switchMode}
            className="font-medium text-ink underline underline-offset-2 transition-colors duration-150 ease-out hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {isSignup ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </div>
    </main>
  );
}
