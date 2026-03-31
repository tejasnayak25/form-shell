"use client";

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn } from 'lucide-react';

export default function SignInPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params?.get('redirect') || '/';
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Lazy-import firebase client helpers so the module isn't required during
    // server-side prerender/build. initFirebaseFromEnv is safe to call in
    // the browser-only effect.
    import('../../lib/firebaseClient').then(({ initFirebaseFromEnv }) => {
      try {
        initFirebaseFromEnv();
      } catch (e) {
        // ignore init errors during hydration
        console.warn('initFirebaseFromEnv failed', e);
      }
    }).catch((e) => {
      console.warn('Failed to load firebase client', e);
    });
  }, []);

  async function handleSignIn() {
    setLoading(true);
    try {
      const m = await import('../../lib/firebaseClient');
      await m.googleSignIn();
      router.push(redirect);
    } catch (err) {
      console.error('Sign-in failed', err);
      setLoading(false);
      alert('Sign-in failed. Please try again.');
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-linear-to-b from-gray-50 via-gray-100 to-white p-8">
      <div className="mx-auto max-w-md bg-white rounded-lg shadow-md p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-800 mb-2">Sign in</h1>
        <p className="text-sm text-gray-600 mb-6">Sign in with Google to continue.</p>
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md shadow focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <LogIn className="w-5 h-5" />
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>
        <div className="mt-4 text-xs text-gray-500">You will be redirected after signing in.</div>
      </div>
    </div>
  );
}
