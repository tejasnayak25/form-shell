"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { initFirebaseFromEnv, googleSignIn, onAuthChange, signOut } from '../../lib/firebaseClient';
import { extractUrlFromEmbed } from '@/lib/sanitize';
import {
  AlertTriangle,
  Camera,
  Check,
  Copy,
  ExternalLink,
  LayoutGrid,
  Link,
  LogIn,
  ShieldCheck,
} from 'lucide-react';

const allowedHosts = ['docs.google.com', 'forms.gle'];
const ROLE_STORAGE_KEY = 'form-shell-role';

export default function TeacherPage() {
  useEffect(() => {
    initFirebaseFromEnv();
  }, []);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<null | { id: string; url: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [origin, setOrigin] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = React.useState(false);
  const [roleTag, setRoleTag] = useState<'teacher' | 'student'>('teacher');

  useEffect(() => {
    const unsub = onAuthChange((u) => setUser(u));
    return () => unsub && unsub();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(ROLE_STORAGE_KEY) as 'teacher' | 'student' | null;
    if (stored) {
      setRoleTag(stored);
    }
    window.localStorage.setItem(ROLE_STORAGE_KEY, 'teacher');
  }, []);

  const linkFeatures = useMemo(
    () => [
      {
        title: 'Locked shell',
        description: 'Students access the form only inside the proctored shell with blur/tab-change detection.',
        icon: ShieldCheck,
      },
      {
        title: 'Live webcam checks',
        description: 'Pose Verification keeps the camera on and pauses the form if the student leaves.',
        icon: Camera,
      },
      {
        title: 'Incident logs',
        description: 'Every alert is appended to /data/logs.json and surfaced in your dashboard.',
        icon: AlertTriangle,
      },
    ],
    [],
  );

  function validateInput(): { sanitized: string; host: string } | null {
    if (!input.trim()) {
      setError('Paste a Google Form URL or iframe snippet.');
      return null;
    }
    const sanitized = extractUrlFromEmbed(input.trim());
    if (!sanitized) {
      setError('Could not extract a valid URL. Please paste the direct Google Form link.');
      return null;
    }
    try {
      const url = new URL(sanitized);
      if (!allowedHosts.some((host) => url.hostname.endsWith(host))) {
        setError('Only Google Forms links are supported for the secured shell.');
        return null;
      }
      return { sanitized, host: url.hostname };
    } catch {
      setError('Invalid URL. Double-check the link and try again.');
      return null;
    }
  }

  async function createLink() {
    setError(null);
    if (!user?.email) {
      setError('Please sign in with Google before creating a secure link.');
      return;
    }
    const validated = validateInput();
    if (!validated) return;

    setIsCreating(true);
    try {
      const payload: any = { input: validated.sanitized, host: validated.host };
      payload.teacher = user.email;

      const res = await fetch('/api/createLink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unknown error');
        return;
      }
      setResult(data);
      setCopied(false);
    } catch {
      setError('Unable to contact the server. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }

  function copyResult() {
    if (!result || !origin) return;
    const shareUrl = `${origin}/form/${result.id}`;
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const shareUrl = result && origin ? `${origin}/form/${result.id}` : '';

  return (
    <div className="min-h-screen bg-linear-to-b from-gray-50 via-gray-100 to-white p-8">
      <div className="mx-auto max-w-5xl space-y-10">
        <header className="flex flex-col gap-4 border-b border-gray-300 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-center sm:text-left">
            <h1 className="text-3xl font-extrabold text-gray-900">Create a Secured Shareable Link</h1>
            <p className="mt-2 text-base text-gray-600">Wrap your Google Form with our proctored shell and send the new URL to students.</p>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <div className="text-right text-sm text-gray-600">
                <p className="font-medium text-gray-800">{user.email}</p>
                <p>{roleTag === 'student' ? 'Student mode active' : 'Teacher account'}</p>
                {roleTag === 'student' && (
                  <span className="text-xs text-red-500">Return to home & choose Teacher Login for full access.</span>
                )}
              </div>
            )}
            {user && (
              <button
                onClick={() => signOut()}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Sign out
              </button>
            )}
            <a
              href="/teacher/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <LayoutGrid className="w-5" />
              Dashboard
            </a>
          </div>
        </header>

        <main className="space-y-10">
          <section className="grid gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm md:grid-cols-3">
            {linkFeatures.map((feature) => (
              <div key={feature.title} className="flex flex-col gap-2">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <feature.icon className="w-5" />
                </div>
                <h3 className="text-base font-semibold text-gray-800">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Step 1</p>
                <h2 className="text-2xl font-bold text-gray-900">Paste your Google Form link</h2>
                <p className="mt-1 text-sm text-gray-500">We support the share URL or the iframe embed code copied from Google Forms.</p>
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="https://docs.google.com/forms/d/e/… or the full iframe embed snippet"
                className="h-40 w-full rounded-xl border border-gray-300 bg-gray-50 p-4 text-sm text-gray-800 shadow-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <div className="flex flex-wrap items-center gap-4">
                {!user ? (
                  <button
                    onClick={() => googleSignIn()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <LogIn className="w-5" />
                    Sign in with Google
                  </button>
                ) : (
                  <button
                    onClick={createLink}
                    disabled={isCreating}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:bg-blue-400"
                  >
                    <Link className="w-5" />
                    {isCreating ? 'Creating…' : 'Create Secure Link'}
                  </button>
                )}
                <p className="text-sm text-gray-500">We verify that the URL belongs to Google Forms before creating the shell.</p>
              </div>
              {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            </div>
          </section>

          {result && (
            <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-md">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Step 2</p>
                <h2 className="text-2xl font-bold text-gray-900">Share this secured link with students</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Students can only access the form inside Form Shell, where pose verification, duplicate detection, and blur logs run automatically.
                </p>
              </div>

              <div className="flex flex-col gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="text-xs uppercase text-gray-500">Secure shell URL</div>
                  <div className="text-base font-semibold text-gray-900 break-all">{shareUrl}</div>
                  <div className="text-xs text-gray-500">
                    Original:{' '}
                    <a href={result.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                      {result.url}
                    </a>
                  </div>
                </div>
                <div className="flex gap-3">
                  <a
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-50"
                    href={`/form/${result.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="w-4" />
                    Open shell
                  </a>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-white"
                    onClick={copyResult}
                  >
                    {copied ? <Check className="w-4" /> : <Copy className="w-4" />}
                    Copy URL
                  </button>
                </div>
              </div>

              <div className="grid gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700 md:grid-cols-2">
                <div>
                  <p className="font-semibold text-gray-900">What students experience</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    <li>Must stay on the page with camera on; shell pauses after repeated blur events.</li>
                    <li>Pose verification overlays the webcam feed and locks the form when tampering is detected.</li>
                    <li>Activity logs (blur, visibility, pose warnings) stream to your dashboard for review.</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Share instructions</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-4">
                    <li>Copy the secure link above and send it in your LMS or email.</li>
                    <li>Remind students to allow camera permissions when prompted.</li>
                    <li>Monitor incidents from the Teacher Dashboard &gt; Logs tab.</li>
                  </ol>
                </div>
              </div>
            </section>
          )}
        </main>

        <footer className="border-t border-gray-300 pt-8 text-center text-sm text-gray-500">© 2025 Form Shell. All rights reserved.</footer>
      </div>
    </div>
  );
}
