"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { initFirebaseFromEnv, googleSignIn, onAuthChange } from '../../../lib/firebaseClient';
import { Check, Copy, ExternalLink, LogIn, Plus, Trash2 } from "lucide-react";

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
              <button
                onClick={() => googleSignIn()}
                className="flex justify-center items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <LogIn className='w-5'/>
                Sign in with Google
              </button>
            ) : (
              <div className="text-right">
                <div className="text-sm text-gray-500">Signed in as</div>
                <div className="text-base font-medium text-gray-800">{user.email}</div>
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
                        onClick={() => copyLink(k)}
                        className={`text-blue-500 text-sm font-medium transition cursor-pointer`}
                        >
                        {copiedId === k ? <Check/> : <Copy/>}
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

        <footer className="pt-8 border-t border-gray-300 text-center text-sm text-gray-500">
          © 2025 Teacher Dashboard. All rights reserved.
        </footer>
      </div>
    </div>
    </>
  );
}
