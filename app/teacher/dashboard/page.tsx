"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { initFirebaseFromEnv, onAuthChange, signOut } from '../../../lib/firebaseClient';
import { Check, Copy, ExternalLink, LogIn, Plus, Trash2, Mail, Ban, MailXIcon, LogOut } from "lucide-react";
import NextLink from 'next/link';

function formatDate(iso?: string) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return iso;
  }
}

export default function TeacherDashboard() {
  const [user, setUser] = useState<any | null>(null);
  const [links, setLinks] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showBlockedFor, setShowBlockedFor] = useState<string | null>(null);
  const [blockedEmails, setBlockedEmails] = useState<string[] | null>(null);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedError, setBlockedError] = useState<string | null>(null);

  useEffect(() => {
    initFirebaseFromEnv();
    const unsub = onAuthChange((u) => setUser(u));
    return () => unsub && unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        // URL encode the email to handle special characters
        const encodedEmail = encodeURIComponent(user.email);
        const res = await fetch(`/api/${encodedEmail}/list-links`);
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
          setError(errorData.error || 'Could not load links');
          return;
        }
        const data = await res.json();
        setLinks(data || {});
      } catch (err: any) {
        console.error('Error loading links:', err);
        setError('Failed to load links. Please try again.');
      }
    }
    load();
  }, [user]);

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

  function handleDeleteClick(id: string) {
    setShowDeleteConfirm(id);
  }

  function handleDeleteCancel() {
    setShowDeleteConfirm(null);
  }

  async function handleDeleteConfirm(id: string) {
    setShowDeleteConfirm(null);
    setError(null);
    
    try {
      const res = await fetch(`/api/teacher/links/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        setError(errorData.error || 'Delete failed');
        return;
      }
      
      // Update UI immediately
      setLinks((prev) => {
        if (!prev) return prev;
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      
      // Also reload links from server to ensure consistency
      if (user) {
        const encodedEmail = encodeURIComponent(user.email);
        const res = await fetch(`/api/${encodedEmail}/list-links`);
        if (res.ok) {
          const data = await res.json();
          setLinks(data || {});
        }
      }
    } catch (err: any) {
      console.error('Delete error:', err);
      setError('Failed to delete link. Please try again.');
    }
  }

  function copyLink(id: string) {
    const url = `${location.origin}/form/${id}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  async function openBlockedEmails(id: string) {
    setShowBlockedFor(id);
    setBlockedEmails(null);
    setBlockedError(null);
    setBlockedLoading(true);
    try {
      const res = await fetch(`/api/links/${encodeURIComponent(id)}/blocked-emails`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to load blocked emails' }));
        setBlockedError(err.error || 'Failed to load blocked emails');
        setBlockedLoading(false);
        return;
      }
      const data = await res.json();
      // Accept either an array or an object with `blockedEmails`/`emails` property
      let emails: string[] = [];
      if (Array.isArray(data)) emails = data;
      else if (Array.isArray(data.blockedEmails)) emails = data.blockedEmails;
      else if (Array.isArray(data.emails)) emails = data.emails;
      else if (data?.emails && typeof data.emails === 'object') emails = (Object.values(data.emails) as unknown[]).flat() as string[];
      setBlockedEmails(emails || []);
    } catch (err: any) {
      console.error('Error loading blocked emails:', err);
      setBlockedError('Failed to load blocked emails.');
    } finally {
      setBlockedLoading(false);
    }
  }

  async function unblockEmail(formId: string, email: string) {
    setBlockedError(null);
    try {
      const res = await fetch(`/api/links/${encodeURIComponent(formId)}/blocked-emails`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to remove blocked email' }));
        setBlockedError(err.error || 'Failed to remove blocked email');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data && data.success === false) {
        setBlockedError(data.message || 'Failed to remove blocked email');
        return;
      }

      // Remove locally from UI
      setBlockedEmails((prev) => (prev ? prev.filter((e) => e !== email) : prev));

      // Also update links state (if present) so list-links reflects change
      setLinks((prev) => {
        if (!prev) return prev;
        const copy = { ...prev };
        if (copy[formId] && Array.isArray(copy[formId].blockedEmails)) {
          copy[formId] = { ...copy[formId], blockedEmails: copy[formId].blockedEmails.filter((e: string) => e !== email) };
        }
        return copy;
      });
    } catch (err: any) {
      console.error('Error removing blocked email:', err);
      setBlockedError('Failed to remove blocked email.');
    }
  }

  function closeBlockedModal() {
    setShowBlockedFor(null);
    setBlockedEmails(null);
    setBlockedError(null);
    setBlockedLoading(false);
  }

  // Balanced scaling and improved aesthetics for a modern look
  return (
    <>
      {/* Delete Confirmation Popup */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Delete Quiz Link</h3>
            <p className="text-gray-600 mb-6">Are you sure you want to delete this quiz link? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteCancel}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConfirm(showDeleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="min-h-screen bg-linear-to-b from-gray-50 via-gray-100 to-white p-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="flex flex-col sm:flex-row items-center justify-between pb-8 border-b border-gray-300 gap-4">
          <div className='text-center sm:text-left'>
            <h1 className="text-3xl font-extrabold text-gray-800">Teacher Dashboard</h1>
            <p className="text-base text-gray-600 mt-2">Manage your shared forms and monitor student activity.</p>
          </div>
          <div className="flex items-center gap-5">
            {!user ? (
              <NextLink
                href={`/signin?redirect=${encodeURIComponent('/teacher/dashboard')}`}
                className="flex justify-center items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <LogIn className='w-5'/>
                Sign in
              </NextLink>
            ) : (
              <button
                onClick={() => signOut()}
                className="flex justify-center items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <LogOut className='w-5'/>
                Sign Out
              </button>
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
                        onClick={() => copyLink(k)}
                        className={`text-blue-500 text-sm font-medium transition cursor-pointer`}
                        >
                        {copiedId === k ? <Check/> : <Copy/>}
                        </button>
                        <button
                        onClick={() => openBlockedEmails(k)}
                        title="Blocked emails"
                        className={`text-gray-600 text-sm font-medium transition cursor-pointer hover:text-gray-800`}
                        >
                        <MailXIcon />
                        </button>
                        <button
                        onClick={() => handleDeleteClick(k)}
                        className={`text-red-500 text-sm font-medium transition cursor-pointer hover:text-red-700`}
                        >
                        <Trash2/>
                        </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>
        </main>

        {/* Blocked emails modal */}
        {showBlockedFor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 bg-opacity-50 size-full">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <div className="flex items-start justify-between">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Blocked Emails for /form/{showBlockedFor}</h3>
                <button onClick={closeBlockedModal} className="text-gray-600 hover:text-gray-500 cursor-pointer">✕</button>
              </div>

              {blockedLoading && <p className="text-sm text-gray-500">Loading...</p>}
              {blockedError && <p className="text-sm text-red-500">{blockedError}</p>}

              {!blockedLoading && !blockedError && (
                <div className="max-h-64 overflow-auto mt-3">
                  {blockedEmails && blockedEmails.length > 0 ? (
                    <ul className="space-y-2">
                      {blockedEmails.map((e) => (
                        <li key={e} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-gray-700 wrap-break-word">{e}</span>
                          <button
                            onClick={() => unblockEmail(showBlockedFor as string, e)}
                            title="Remove blocked email"
                            className="text-red-500 hover:text-red-700 px-2 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-gray-500">No blocked emails found.</div>
                  )}
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button onClick={closeBlockedModal} className="px-4 py-2 bg-gray-600 rounded-lg hover:bg-gray-500 cursor-pointer">Close</button>
              </div>
            </div>
          </div>
        )}

        <footer className="pt-8 border-t border-gray-300 text-center text-sm text-gray-500">
          © 2025 Teacher Dashboard. All rights reserved.
        </footer>
      </div>
    </div>
    </>
  );
}
