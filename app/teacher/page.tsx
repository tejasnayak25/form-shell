"use client";

import React, { useState, useEffect } from 'react';
import { initFirebaseFromEnv, googleSignIn, onAuthChange } from '../../lib/firebaseClient';
import { Check, Copy, ExternalLink, LayoutGrid, Link, LogIn } from 'lucide-react';

export default function TeacherPage() {
  useEffect(() => {
    initFirebaseFromEnv();
  }, []);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<null | { id: string; url: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);

  useEffect(() => {
    const unsub = onAuthChange((u) => setUser(u));
    return () => unsub && unsub();
  }, []);

  async function createLink() {
    setError(null);
    const payload: any = { input };
    if (user?.email) payload.teacher = user.email;
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
  }

  const [copied, setCopied] = React.useState(false);

  function copyResult() {
    if (!result) return;
    navigator.clipboard?.writeText(`${location.origin}/form/${result.id}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-gray-50 via-gray-100 to-white p-8">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="flex flex-col sm:flex-row items-center justify-between pb-8 border-b border-gray-300 gap-4">
          <div className='text-center sm:text-left'>
            <h1 className="text-3xl font-extrabold text-gray-800">Create a Shareable Form Link</h1>
            <p className="text-base text-gray-600 mt-2">
              Paste an embed code or a URL to the external form. We&apos;ll sanitize and create a student-access link.
            </p>
          </div>
          <div className="flex items-center gap-5">
            <a
              href="/teacher/dashboard"
              className="inline-flex justify-center items-center gap-1.5 px-5 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <LayoutGrid className='w-5'/>
              Dashboard
            </a>
          </div>
        </header>

        <main className="space-y-8">
          <div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste iframe embed code or a direct URL"
              className="w-full h-40 p-4 rounded-lg border border-gray-300 bg-gray-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white text-gray-800 placeholder:text-gray-400 text-sm"
            />
            <div className="mt-4 flex items-center gap-4">
              {!user ? (
                <button
                  onClick={() => googleSignIn()}
                  className="flex justify-center items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <LogIn className='w-5'/>
                  Sign in with Google
                </button>
              ) : (
                <button
                  onClick={createLink}
                  className="flex justify-center items-center gap-1.5 cursor-pointer px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <Link className='w-5'/>
                  Create Link
                </button>
              )}
              {error && <div className="text-red-600 text-sm">{error}</div>}
            </div>
          </div>

          {result && (
            <div className="rounded-xl bg-white p-6 shadow-md border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">Shareable link</div>
                  <div className="mt-1 font-medium text-gray-800">
                    {location.origin}/form/{result.id}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Original:{' '}
                    <a href={result.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                      Open original
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    className="px-4 py-2 flex justify-center items-center gap-1.5 bg-white border rounded-lg text-sm font-medium hover:bg-gray-100 text-blue-600 border-blue-600"
                    href={`/form/${result.id}`}
                    target="_blank"
                  >
                    <ExternalLink className='w-4'/>
                    Open
                  </a>
                  <button
                    className="px-4 py-2 flex justify-center items-center gap-1.5 bg-white border rounded-lg text-sm font-medium hover:bg-gray-100 text-slate-800"
                    onClick={copyResult}
                  >
                    { copied ? <Check className='w-4'/> : <Copy className='w-4'/> }
                    Copy URL
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="pt-8 border-t border-gray-300 text-center text-sm text-gray-500">
          © 2025 Teacher Dashboard. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
