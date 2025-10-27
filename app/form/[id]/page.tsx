"use client";
import { useParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { initFirebaseFromEnv, googleSignIn, onAuthChange } from '../../../lib/firebaseClient';

export default function FormPage() {
  const { id } = useParams() as { id?: string };
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    initFirebaseFromEnv();
    const unsub = onAuthChange((u) => {
      setUserEmail(u?.email ?? null);
    });
    return () => unsub && unsub();
  }, []);

  useEffect(() => {
    if (!id) {
      setError('No form id provided');
      return;
    }

    async function load() {
      const res = await fetch(`/api/links/${id}`);
      if (!res.ok) {
        setError('Link data not available');
        return;
      }
      const entry = await res.json();
      if (!entry) {
        setError('Link not found');
        return;
      }

      let finalUrl = entry.url as string;
      // Append student email if available
      if (userEmail) {
        try {
          const u = new URL(finalUrl);
          u.searchParams.set('student_email', userEmail);
          finalUrl = u.toString();
        } catch (e) {
          // If URL constructor fails (relative or malformed), append safely
          const sep = finalUrl.includes('?') ? '&' : '?';
          finalUrl = `${finalUrl}${sep}student_email=${encodeURIComponent(userEmail)}`;
        }
      }

      setLink(finalUrl);
    }

    load();
  }, [id, userEmail]);

  // Basic anti-cheat: detect blur/visibility changes and post to log API, include student email when available
  useEffect(() => {
    function sendEvent(payload: Record<string, any>) {
      fetch('/api/logEvent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, studentEmail: userEmail ?? null, ...payload }),
      });
    }

    function handleVisibility() {
      const hidden = document.hidden;
      sendEvent({ type: 'visibility', hidden });
    }

    function handleBlur() {
      sendEvent({ type: 'blur' });
    }

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
    };
  }, [id, userEmail]);

  return (
    <div className="min-h-screen bg-linear-to-b from-gray-50 via-gray-100 to-white p-8">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="flex items-center justify-between pb-8 border-b border-gray-300">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-800">Student Form</h1>
          </div>
        </header>

        <main className="space-y-8">
          {!userEmail ? (
            <div className="text-center">
              <p className="mb-4 text-base text-gray-600">Please sign in with Google to continue so we can prefill your email into the form.</p>
              <button
                onClick={() => googleSignIn()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                Sign in with Google
              </button>
            </div>
          ) : (
            <div>
              {error && <div className="text-red-600 text-sm">{error}</div>}
              {link ? (
                <div className="mt-4">
                  <p className="mb-4 text-base text-gray-600">The form is embedded below. You may be asked to login by the form provider.</p>
                  <iframe
                    ref={iframeRef}
                    src={link}
                    className="w-full h-[700px] border border-gray-300 rounded-lg shadow-md"
                    sandbox="allow-forms allow-scripts allow-same-origin"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="text-center text-gray-600">Loading...</div>
              )}
            </div>
          )}
        </main>

        <footer className="pt-8 border-t border-gray-300 text-center text-sm text-gray-500">
          © 2025 Form Shell. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
