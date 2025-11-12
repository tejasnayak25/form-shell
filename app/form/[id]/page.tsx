"use client";

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { RealTimeAlerts, type AlertItem } from '@/components/RealTimeAlerts';
import type { VerificationStatus } from '@/components/PoseVerification';
import { initFirebaseFromEnv, googleSignIn, onAuthChange, signOut } from '../../../lib/firebaseClient';
import {
  createEvent,
  initialAntiCheatState,
  shouldLockForm,
  updateSessionState,
  type AntiCheatEvent,
} from '@/lib/antiCheat';

const PoseVerification = dynamic(
  () => import('@/components/PoseVerification').then((mod) => mod.PoseVerification),
  { ssr: false, loading: () => <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">Initializing camera…</div> },
);

const ROLE_STORAGE_KEY = 'form-shell-role';

export default function FormPage() {
  const { id } = useParams() as { id?: string };
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [antiCheatState, setAntiCheatState] = useState(() => initialAntiCheatState());
  const [duplicateDetected, setDuplicateDetected] = useState(false);
  const [verification, setVerification] = useState<VerificationStatus | null>(null);
  const [allowRetry, setAllowRetry] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const lastPoseLogRef = useRef<number>(0);
  const lastPoseFlagRef = useRef<boolean>(false);
  const fullscreenTargetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    initFirebaseFromEnv();
    const unsub = onAuthChange((u) => setUserEmail(u?.email ?? null));
    return () => unsub && unsub();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ROLE_STORAGE_KEY, 'student');
    }
  }, []);

  useEffect(() => {
    function handleFullscreenChange() {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (!active) {
        setFullscreenError('You left fullscreen. Return to continue or exit the secured session.');
      } else {
        setFullscreenError(null);
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    async function tryFullscreen() {
      if (!fullscreenTargetRef.current) return;
      if (document.fullscreenElement) {
        setIsFullscreen(true);
        return;
      }
      try {
        await fullscreenTargetRef.current.requestFullscreen();
        setIsFullscreen(true);
        setFullscreenError(null);
      } catch {
        setIsFullscreen(false);
        setFullscreenError('Please click "Enter fullscreen" to start the secured session.');
      }
    }
    // small delay to ensure DOM ready
    const timer = setTimeout(() => {
      tryFullscreen();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const enterFullscreen = useCallback(async () => {
    if (!fullscreenTargetRef.current) return;
    try {
      await fullscreenTargetRef.current.requestFullscreen();
      setIsFullscreen(true);
      setFullscreenError(null);
    } catch {
      setFullscreenError('Fullscreen request was blocked. Please allow fullscreen to continue.');
    }
  }, []);

  const handleExitSession = useCallback(() => {
    setError('Session ended. Window will close.');
    setTimeout(() => {
      window.close();
      if (!window.closed) {
        window.location.href = '/';
      }
    }, 400);
  }, []);

  useEffect(() => {
    if (!id || !userEmail) return;
    let cancelled = false;
    let interval: NodeJS.Timeout | null = null;

    async function fetchStatus() {
      try {
        const res = await fetch(`/api/formStatus/${id}?studentEmail=${encodeURIComponent(userEmail)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setAllowRetry(Boolean(data.allowRetry));
        if (data.allowRetry) {
          setStatusNote('Your instructor has cleared previous incidents. You may continue.');
        } else {
          setStatusNote(null);
        }
      } catch {
        // ignore
      }
    }

    fetchStatus();
    interval = setInterval(fetchStatus, 15000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [id, userEmail]);

  const sendLog = useCallback(
    (payload: Record<string, any>) => {
      if (!id) return;
      fetch('/api/logEvent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId: id,
          studentEmail: userEmail ?? null,
          ...payload,
        }),
      }).catch(() => {
        // ignore network errors for logging
      });
    },
    [id, userEmail],
  );

  const trackEvent = useCallback(
    (event: AntiCheatEvent) => {
      setAntiCheatState((prev) => updateSessionState(prev, event));
      if (event.level !== 'info') {
        setAlerts((prev) => {
          const next: AlertItem[] = [
            ...prev,
            {
              id: event.id,
              level: event.level,
              message: event.message,
              timestamp: event.timestamp,
              metadata: event.metadata,
            },
          ];
          return next.slice(-6);
        });
      }
      sendLog({
        id: event.id,
        type: event.type,
        severity: event.level,
        message: event.message,
        metadata: event.metadata,
        hidden: event.metadata?.hidden,
      });
    },
    [sendLog],
  );

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
      if (userEmail) {
        try {
          const u = new URL(finalUrl);
          u.searchParams.set('student_email', userEmail);
          finalUrl = u.toString();
        } catch {
          const sep = finalUrl.includes('?') ? '&' : '?';
          finalUrl = `${finalUrl}${sep}student_email=${encodeURIComponent(userEmail)}`;
        }
      }

      setLink(finalUrl);
      trackEvent(createEvent('heartbeat', 'info', 'Form session initialized', { url: finalUrl }));
    }

    load();
  }, [id, trackEvent, userEmail]);

  useEffect(() => {
    if (!id) return;
    const key = `form-shell-session-${id}`;
    if (typeof window === 'undefined') return;
    const existing = sessionStorage.getItem(key);
    if (existing) {
      setDuplicateDetected(true);
      trackEvent(createEvent('duplicate', 'critical', 'Multiple concurrent attempts detected', { key }));
    } else {
      sessionStorage.setItem(key, new Date().toISOString());
    }

    return () => {
      sessionStorage.removeItem(key);
    };
  }, [id, trackEvent]);

  useEffect(() => {
    function handleVisibility() {
      const hidden = document.hidden;
      const level = hidden ? 'warning' : 'info';
      trackEvent(
        createEvent('visibility', level, hidden ? 'Tab hidden during attempt' : 'Tab visibility restored', {
          hidden,
        }),
      );
    }

    function handleBlur() {
      trackEvent(createEvent('blur', 'warning', 'Window lost focus', {}));
    }

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
    };
  }, [trackEvent]);

  const handleVerificationUpdate = useCallback(
    (nextStatus: VerificationStatus) => {
      setVerification(nextStatus);
      const now = Date.now();
      const flaggedChanged = nextStatus.flagged !== lastPoseFlagRef.current;
      const longSinceLast = now - lastPoseLogRef.current > 5000;
      if (!flaggedChanged && !longSinceLast) return;

      lastPoseFlagRef.current = nextStatus.flagged;
      lastPoseLogRef.current = now;

      const event = createEvent(
        'pose',
        nextStatus.flagged ? 'warning' : 'info',
        nextStatus.flagged ? nextStatus.message ?? 'Pose anomaly detected' : 'Pose verification stable',
        {
          confidence: nextStatus.confidence,
          faceVisible: nextStatus.faceVisible,
          flagged: nextStatus.flagged,
        },
      );
      trackEvent(event);
    },
    [trackEvent],
  );

  const baseLock = !allowRetry && (duplicateDetected || shouldLockForm(antiCheatState));
  const fullscreenLock = !isFullscreen;
  const lockForm = baseLock || fullscreenLock;

  const lockReason = useMemo(() => {
    if (fullscreenLock) {
      return 'Fullscreen is required. Please return to fullscreen mode to continue.';
    }
    if (duplicateDetected) {
      return 'Access blocked because another active session was detected for this form.';
    }
    if (shouldLockForm(antiCheatState)) {
      return 'Session locked due to repeated suspicious activity. Please contact your instructor.';
    }
    return null;
  }, [antiCheatState, duplicateDetected, fullscreenLock]);

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  }, []);

  return (
    <div ref={fullscreenTargetRef} className="min-h-screen bg-linear-to-b from-gray-50 via-gray-100 to-white p-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="flex flex-col gap-4 border-b border-gray-300 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-800">Secured Student Form</h1>
            <p className="mt-2 text-sm text-gray-600">
              Keep your camera on and remain focused on this tab. Suspicious actions pause the form automatically.
            </p>
          </div>
          {userEmail && (
            <div className="flex flex-col items-end gap-2 text-right text-sm text-gray-600">
              <div>Signed in as {userEmail}</div>
              <button
                onClick={() => signOut()}
                className="text-xs font-semibold text-blue-600 underline underline-offset-2"
              >
                Sign out
              </button>
            </div>
          )}
        </header>

        <main className="space-y-8">
          {!userEmail ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
              <p className="mb-4 text-base text-gray-600">
                Please sign in with Google to continue so we can prefill your email into the form.
              </p>
              <button
                onClick={() => googleSignIn()}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                Sign in with Google
              </button>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
              <section>
                {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
                {link ? (
                  <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-800">Embedded Form</h2>
                      <p className="text-sm text-gray-500">We will pause access if verification fails.</p>
                    </div>
                    {allowRetry && statusNote && (
                      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                        {statusNote}
                      </div>
                    )}
                    <div className="relative">
                      <iframe
                        src={link}
                        className={`h-[700px] w-full rounded-lg border border-gray-300 shadow-md ${lockForm ? 'opacity-40' : 'opacity-100'}`}
                        sandbox="allow-forms allow-scripts allow-same-origin"
                        referrerPolicy="no-referrer"
                      />
                      {(lockForm || fullscreenError) && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-white/90 text-center">
                          <p className="text-base font-semibold text-gray-800">
                            {fullscreenLock ? 'Fullscreen required' : 'Form access paused'}
                          </p>
                          {(fullscreenError || lockReason) && (
                            <p className="mt-2 max-w-md text-sm text-gray-600">
                              {fullscreenError || lockReason}
                            </p>
                          )}
                          {fullscreenLock && (
                            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                              <button
                                onClick={enterFullscreen}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                              >
                                Enter fullscreen
                              </button>
                              <button
                                onClick={handleExitSession}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Exit session
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600 shadow-sm">
                    Loading form data…
                  </div>
                )}
              </section>

              <section className="space-y-6">
                <PoseVerification onStatusChange={handleVerificationUpdate} paused={lockForm} />
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-sm font-semibold text-gray-800">Real-time Alerts</p>
                  <RealTimeAlerts alerts={alerts} onDismiss={dismissAlert} />
                </div>
              </section>
            </div>
          )}
        </main>

        <footer className="border-t border-gray-300 pt-8 text-center text-sm text-gray-500">
          © 2025 Form Shell. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
