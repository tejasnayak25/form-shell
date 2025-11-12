"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { initFirebaseFromEnv, googleSignIn, onAuthChange, signOut } from '../../../lib/firebaseClient';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  LogIn,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

const ROLE_STORAGE_KEY = 'form-shell-role';

function formatDate(iso?: string) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return iso;
  }
}

type StudentActivity = {
  studentEmail: string | null;
  eventCount: number;
  warnings: number;
  criticals: number;
  lastEvent: string;
  lastMessage: string;
};

type ActivityData = {
  formId: string;
  totalEvents: number;
  totalStudents: number;
  lastEventTime: string | null;
  students: StudentActivity[];
  recentEvents: {
    id: string;
    time: string;
    severity: 'info' | 'warning' | 'critical';
    studentEmail: string | null;
    message: string;
    type: string;
  }[];
  resets: {
    studentEmail: string;
    formId: string;
    grantedBy: string;
    grantedAt: string;
    note?: string;
  }[];
};

const severityBadge: Record<'info' | 'warning' | 'critical', string> = {
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

export default function TeacherDashboard() {
  const [user, setUser] = useState<any | null>(null);
  const [links, setLinks] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeLinkId, setActiveLinkId] = useState<string | null>(null);
  const [activityData, setActivityData] = useState<ActivityData | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    initFirebaseFromEnv();
    const unsub = onAuthChange((u) => setUser(u));
    return () => unsub && unsub();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ROLE_STORAGE_KEY, 'teacher');
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    async function load() {
      const res = await fetch(`/api/${user.email}/list-links`);
      if (!res.ok) {
        setError('Could not load links');
        return;
      }
      const data = await res.json();
      setLinks(data);
    }
    load();
  }, [user]);

  const loadActivity = useCallback(async (linkId: string) => {
    setActivityLoading(true);
    setActivityError(null);
    try {
      const res = await fetch(`/api/teacher/logs/${linkId}`);
      if (!res.ok) {
        throw new Error('Failed to load activity');
      }
      const data = await res.json();
      setActivityData(data);
    } catch (err) {
      console.error(err);
      setActivityError('Unable to load activity for this link.');
      setActivityData(null);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeLinkId) {
      setActivityData(null);
      setActivityError(null);
      return;
    }
    loadActivity(activeLinkId);
  }, [activeLinkId, loadActivity]);

  const myEntries = useMemo(() => {
    if (!links || !user) return [] as [string, any][];
    return Object.entries(links)
      .filter(([k, v]) => v.teacher === user.email)
      .filter(([k, v]) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return k.toLowerCase().includes(q) || (v.url && v.url.toLowerCase().includes(q));
      });
  }, [links, user, query]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this link?')) return;
    const res = await fetch(`/api/teacher/links/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('Delete failed');
      return;
    }
    setLinks((prev) => {
      if (!prev) return prev;
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }

  function copyLink(id: string) {
    const url = `${location.origin}/form/${id}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function openActivity(id: string) {
    setActiveLinkId(id);
  }

  function closeActivity() {
    setActiveLinkId(null);
  }

  async function handleAllowRetry(studentEmail: string, allow: boolean) {
    if (!activeLinkId || !user || !studentEmail) return;
    try {
      const res = await fetch('/api/teacher/resets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId: activeLinkId,
          studentEmail,
          allow,
          grantedBy: user.email,
        }),
      });
      if (!res.ok) {
        throw new Error('Failed to update access');
      }
      await loadActivity(activeLinkId);
    } catch (err) {
      console.error(err);
      setActivityError('Could not update student access. Please try again.');
    }
  }

  // Balanced scaling and improved aesthetics for a modern look
  return (
    <div className="min-h-screen bg-linear-to-b from-gray-50 via-gray-100 to-white p-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="flex flex-col sm:flex-row items-center justify-between pb-8 border-b border-gray-300 gap-4">
          <div className='text-center sm:text-left'>
            <h1 className="text-3xl font-extrabold text-gray-800">Teacher Dashboard</h1>
            <p className="text-base text-gray-600 mt-2">Manage your shared forms and monitor student activity.</p>
          </div>
          <div className="flex items-center gap-5">
            {!user ? (
              <button
                onClick={() => googleSignIn()}
                className="flex justify-center items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <LogIn className='w-5'/>
                Sign in with Google
              </button>
            ) : (
              <div className="flex flex-col items-end gap-2 text-right">
                <div>
                  <div className="text-sm text-gray-500">Signed in as</div>
                  <div className="text-base font-medium text-gray-800">{user.email}</div>
                </div>
                <button
                  onClick={() => signOut()}
                  className="text-sm font-medium text-gray-600 underline underline-offset-4 hover:text-gray-800"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="space-y-8">
          <div className="flex items-center justify-between gap-5">
            <div className="flex-1">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by id or URL"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-5 py-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white text-gray-800 placeholder:text-gray-400 text-sm"
              />
            </div>
            <div className="w-40">
              <a
                href="/teacher"
                className="inline-flex gap-1 justify-center items-center w-full px-5 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <Plus />
                Create new
              </a>
            </div>
          </div>

          <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {myEntries.length === 0 && (
              <div className="col-span-full rounded-lg border border-gray-300 bg-white p-8 text-center text-gray-600 shadow">
                No links found. Create a link using the Create page.
              </div>
            )}

            {myEntries.map(([k, v]) => (
              <div
                key={k}
                className="rounded-xl bg-white p-6 shadow-md border border-gray-200 hover:shadow-lg transition-transform transform hover:-translate-y-1 overflow-hidden"
              >
                <div className=" gap-4 w-full">
                  <div className="flex-1">
                    <div className="text-sm text-gray-500 wrap-break-word">/form/{k}</div>
                    <h3 className="mt-2 text-base font-semibold text-gray-800 whitespace-nowrap text-ellipsis overflow-hidden">{v.url}</h3>
                    <div className="mt-3 text-sm text-gray-500">Created: {formatDate(v.createdAt)}</div>
                  </div>
                  <div className="flex items-center justify-between mt-5 gap-3">
                    <a
                      href={`/form/${k}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm flex justify-center items-center gap-1 text-blue-600 hover:underline"
                    >
                        <ExternalLink/>
                        Open
                    </a>
                    <div className='flex justify-center items-center gap-3'>
                        <button
                        onClick={() => openActivity(k)}
                        className="text-indigo-600 text-sm font-medium transition cursor-pointer"
                        >
                        Activity
                        </button>
                        <button
                        onClick={() => copyLink(k)}
                        className={`text-blue-500 text-sm font-medium transition cursor-pointer`}
                        >
                        {copiedId === k ? <Check/> : <Copy/>}
                        </button>
                        <button
                        onClick={() => handleDelete(k)}
                        className={`text-red-500 text-sm font-medium transition cursor-pointer`}
                        >
                        <Trash2/>
                        </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>

          {activeLinkId && (
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-md">
              <div className="flex flex-col gap-4 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Live activity</p>
                  <h2 className="text-2xl font-bold text-gray-900">/form/{activeLinkId}</h2>
                  <p className="text-sm text-gray-500">Monitor incidents and allow students to resume attempts.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => loadActivity(activeLinkId)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <RefreshCw className="w-4" />
                    Refresh
                  </button>
                  <button
                    onClick={closeActivity}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>

              {activityError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {activityError}
                </div>
              )}

              {activityLoading && (
                <div className="mt-6 flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="w-4 animate-spin" />
                  Loading activity…
                </div>
              )}

              {!activityLoading && activityData && (
                <div className="mt-6 space-y-8">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                      <div className="text-xs uppercase text-gray-500">Students tracked</div>
                      <div className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900">
                        <Users className="w-5 text-blue-500" />
                        {activityData.totalStudents}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                      <div className="text-xs uppercase text-gray-500">Total events</div>
                      <div className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900">
                        <ShieldCheck className="w-5 text-green-500" />
                        {activityData.totalEvents}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                      <div className="text-xs uppercase text-gray-500">Alerts</div>
                      <div className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900">
                        <AlertTriangle className="w-5 text-amber-500" />
                        {activityData.students.reduce((sum, s) => sum + s.warnings + s.criticals, 0)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                      <div className="text-xs uppercase text-gray-500">Retry permissions</div>
                      <div className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900">
                        <ShieldCheck className="w-5 text-purple-500" />
                        {activityData.resets.length}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">Students & alerts</h3>
                      <p className="text-sm text-gray-500">Grant or revoke access per student.</p>
                    </div>
                    {activityData.students.length === 0 ? (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                        No student activity recorded yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold text-gray-600">Student</th>
                              <th className="px-4 py-2 text-left font-semibold text-gray-600">Events</th>
                              <th className="px-4 py-2 text-left font-semibold text-gray-600">Warnings</th>
                              <th className="px-4 py-2 text-left font-semibold text-gray-600">Critical</th>
                              <th className="px-4 py-2 text-left font-semibold text-gray-600">Last event</th>
                              <th className="px-4 py-2 text-left font-semibold text-gray-600">Access</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {activityData.students.map((student) => {
                              const email = student.studentEmail ?? 'Unknown';
                              const allowed = activityData.resets.some(
                                (reset) => reset.studentEmail.toLowerCase() === (student.studentEmail ?? '').toLowerCase(),
                              );
                              return (
                                <tr key={`${activeLinkId}-${email}`}>
                                  <td className="px-4 py-2 font-medium text-gray-900">{email}</td>
                                  <td className="px-4 py-2 text-gray-700">{student.eventCount}</td>
                                  <td className="px-4 py-2 text-amber-600">{student.warnings}</td>
                                  <td className="px-4 py-2 text-red-600">{student.criticals}</td>
                                  <td className="px-4 py-2 text-gray-500">{formatDate(student.lastEvent)}</td>
                                  <td className="px-4 py-2">
                                    {student.studentEmail ? (
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                            allowed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                          }`}
                                        >
                                          {allowed ? 'Allowed' : 'Blocked'}
                                        </span>
                                        <button
                                          onClick={() => handleAllowRetry(student.studentEmail!, !allowed)}
                                          className="text-xs font-medium text-blue-600 hover:underline"
                                        >
                                          {allowed ? 'Revoke' : 'Allow retry'}
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-gray-500">No email</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-gray-900">Recent incidents</h3>
                    {activityData.recentEvents.length === 0 ? (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                        No incidents have been logged for this form.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activityData.recentEvents.map((event) => (
                          <div
                            key={event.id}
                            className={`rounded-lg border px-4 py-3 text-sm ${severityBadge[event.severity]}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="font-semibold">{event.message}</div>
                              <div className="text-xs">{formatDate(event.time)}</div>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                              <span>{event.studentEmail ?? 'Unknown student'}</span>
                              <span>•</span>
                              <span>{event.type}</span>
                              <span>•</span>
                              <span className="capitalize">{event.severity}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </main>

        <footer className="pt-8 border-t border-gray-300 text-center text-sm text-gray-500">
          © 2025 Teacher Dashboard. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
