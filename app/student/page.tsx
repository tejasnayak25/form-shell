"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { initFirebaseFromEnv, googleSignIn, onAuthChange, signOut } from '@/lib/firebaseClient';
import { ArrowRight, LogIn, LogOut, Shield } from 'lucide-react';

const ROLE_STORAGE_KEY = 'form-shell-role';

export default function StudentPortal() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const router = useRouter();

  useEffect(() => {
    initFirebaseFromEnv();
    const unsub = onAuthChange((u) => setUser(u));
    if (typeof window !== 'undefined') {
      localStorage.setItem(ROLE_STORAGE_KEY, 'student');
    }
    return () => unsub && unsub();
  }, []);

  function handleGoToForm() {
    if (!code.trim()) {
      setError('Enter the exam code shared by your instructor.');
      return;
    }
    setError(null);
    router.push(`/form/${code.trim()}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="flex items-center gap-3 text-sm font-semibold text-indigo-200">
            <Shield className="h-4 w-4 text-amber-300" />
            Secured Student Portal
          </div>
          <h1 className="mt-3 text-3xl font-bold text-white">Enter your exam code to continue</h1>
          <p className="mt-2 text-sm text-slate-200">
            Stay in fullscreen, keep the camera on, and follow on-screen alerts. Form Shell will pause your form if suspicious activity is
            detected.
          </p>

          <div className="mt-8 space-y-4">
            <label className="text-sm font-semibold text-slate-100">Exam code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Example: r4lhwb7"
              className="w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-base text-white placeholder:text-slate-400 focus:border-white focus:outline-none"
            />
            {error && <p className="text-sm text-amber-300">{error}</p>}
            <button
              onClick={handleGoToForm}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 text-base font-semibold text-slate-900 shadow-lg shadow-amber-500/30 transition hover:-translate-y-0.5"
            >
              Continue to Secure Form
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-100">
            <p className="font-semibold text-white">Before you begin</p>
            <ul className="mt-3 list-disc space-y-1 pl-4">
              <li>Allow camera permissions when prompted.</li>
              <li>Stay in fullscreen mode at all times.</li>
              <li>Keep this tab active; switching tabs triggers alerts.</li>
              <li>Use the same Google account requested by your instructor.</li>
            </ul>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-100 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-white">Need to sign in?</p>
              <p className="text-xs text-slate-300">Signing in now saves time when the secure form opens.</p>
            </div>
            <button
              onClick={() => googleSignIn()}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:border-white"
            >
              <LogIn className="h-4 w-4" />
              Sign in with Google
            </button>
          </div>

          {user && (
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-emerald-300/40 bg-emerald-400/10 p-4 text-sm text-emerald-100 sm:flex-row sm:items-center sm:justify-between">
              <div>
                Signed in as <span className="font-semibold">{user.email}</span>
              </div>
              <button
                onClick={() => signOut()}
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200/50 px-3 py-1 text-xs font-semibold text-emerald-50 hover:border-white"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">© {new Date().getFullYear()} Form Shell. Follow your instructor’s directions.</p>
      </div>
    </div>
  );
}
