"use client";

import React, { useState, useEffect, useRef } from 'react';
import { initFirebaseFromEnv, onAuthChange } from '../../lib/firebaseClient';
import NextLink from 'next/link';
import { Check, Copy, ExternalLink, LayoutGrid, Link, LogIn, X, Loader2, Info } from 'lucide-react';

// Loading animation component
function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-4">
      <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      <p className="text-gray-600 text-sm">Creating your link...</p>
    </div>
  );
}

// Popup component for validation errors
function ErrorPopup({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Validation Error</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-gray-600 mb-4">{message}</p>
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          OK
        </button>
      </div>
    </div>
  );
}

export default function TeacherPage() {
  useEffect(() => {
    initFirebaseFromEnv();
  }, []);
  const [input, setInput] = useState('');
  const [requireFaceProctor, setRequireFaceProctor] = useState(true);
  const [requireVoiceProctor, setRequireVoiceProctor] = useState(false);
  const [result, setResult] = useState<null | { id: string; url: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<any | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onAuthChange((u) => setUser(u));
    return () => unsub && unsub();
  }, []);

  async function createLink() {
    setError(null);
    setShowErrorPopup(false);
    setResult(null);
    
    // Validate input
    if (!input || !input.trim()) {
      setErrorMessage('Please enter a form URL or iframe embed code.');
      setShowErrorPopup(true);
      return;
    }

    setIsLoading(true);
    
    try {
      const payload: any = { input, requireFaceProctor, requireVoiceProctor };
      if (user?.email) payload.teacher = user.email;
      
      const res = await fetch('/api/createLink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      let data;
      try {
        data = await res.json();
      } catch (parseError) {
        // If response is not JSON, show the status text
        setErrorMessage(`Server error (${res.status}): ${res.statusText || 'Unknown error'}`);
        setShowErrorPopup(true);
        setIsLoading(false);
        return;
      }
      
      if (!res.ok) {
        const errorMsg = data.error || 'Could not extract a valid URL. Please check your input and try again.';
        const details = data.details ? ` Details: ${data.details}` : '';
        setErrorMessage(errorMsg + details);
        setShowErrorPopup(true);
        setIsLoading(false);
        return;
      }
      
      // Success - set the result
      if (data && data.id && data.url) {
        setResult(data);
        // Clear input after successful creation
        setInput('');
        // Scroll to result after a brief delay to ensure it's rendered
        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      } else {
        setErrorMessage('Invalid response from server. Please try again.');
        setShowErrorPopup(true);
      }
    } catch (err: any) {
      console.error('Error creating link:', err);
      // Check if it's a network error or other error
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setErrorMessage('Network error. Please check your connection and try again.');
      } else {
        setErrorMessage(`Error: ${err.message || 'An unexpected error occurred. Please try again.'}`);
      }
      setShowErrorPopup(true);
    } finally {
      setIsLoading(false);
    }
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
    <>
      {showErrorPopup && (
        <ErrorPopup
          message={errorMessage}
          onClose={() => setShowErrorPopup(false)}
        />
      )}
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
              <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <label className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-800">Require face detection</span>
                    <span className="text-xs text-gray-500">Ask students to allow camera; detects presence and gaze.</span>
                  </div>
                  <button
                    aria-pressed={requireFaceProctor}
                    onClick={() => setRequireFaceProctor(!requireFaceProctor)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ml-3 ${requireFaceProctor ? 'bg-blue-600' : 'bg-gray-300'}`}
                    title="Require students to enable face proctoring"
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${requireFaceProctor ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <Info className="w-4 h-4 text-gray-400 ml-2" title="Face detection uses the webcam to ensure the student is present during the quiz" />
                </label>

                <label className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-800">Require voice detection</span>
                    <span className="text-xs text-gray-500">Optional: monitors microphone for suspicious speech.</span>
                  </div>
                  <button
                    aria-pressed={requireVoiceProctor}
                    onClick={() => setRequireVoiceProctor(!requireVoiceProctor)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ml-3 ${requireVoiceProctor ? 'bg-blue-600' : 'bg-gray-300'}`}
                    title="Require students to enable voice proctoring"
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${requireVoiceProctor ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <Info className="w-4 h-4 text-gray-400 ml-2" title="Voice detection listens for suspicious keywords or external audio" />
                </label>
              </div>
              <div className="text-xs text-gray-500">
                Choose whether this link should require camera or microphone access. These settings are saved with the generated link.
              </div>
              <div className="flex items-center gap-4">
              {!user ? (
                <NextLink
                  href={`/signin?redirect=${encodeURIComponent('/teacher')}`}
                  className="flex justify-center items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <LogIn className='w-5'/>
                  Sign in
                </NextLink>
              ) : (
                <button
                  onClick={createLink}
                  disabled={isLoading}
                  className="flex justify-center items-center gap-1.5 cursor-pointer px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg shadow focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className='w-5 h-5 animate-spin'/>
                      Creating...
                    </>
                  ) : (
                    <>
                      <Link className='w-5'/>
                      Create Link
                    </>
                  )}
                </button>
              )}
              {error && <div className="text-red-600 text-sm">{error}</div>}
              </div>
            </div>
          </div>

          {isLoading && <LoadingSpinner />}

          {result && result.id && (
            <div ref={resultRef} className="rounded-xl bg-white p-6 shadow-md border border-gray-200 animate-fade-in">
              <div className="flex items-center justify-between md:flex-row flex-col gap-4">
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
    </>
  );
}
