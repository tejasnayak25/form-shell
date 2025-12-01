"use client";
import { useParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { initFirebaseFromEnv, googleSignIn, onAuthChange } from '../../../lib/firebaseClient';
import FaceProctor from './FaceProctor';

export default function FormPage() {
  const { id } = useParams() as { id?: string };
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedChecked, setBlockedChecked] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(true);
  const [quizStarted, setQuizStarted] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [facePresent, setFacePresent] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [showViolationPopup, setShowViolationPopup] = useState(false);
  const [showCheatingDetected, setShowCheatingDetected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const ignoreViolationsRef = useRef(false); // Grace period flag
  const gracePeriodEndTimeRef = useRef<number>(0); // Track when grace period ends
  const lastViolationTimeRef = useRef<number>(0); // Track last violation time to prevent duplicates
  const violationCooldownRef = useRef<number>(2000); // 2 second cooldown between violations
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const blockedPostedRef = useRef(false); // Ensure we only post block once per session

  useEffect(() => {
    // Best-effort: try to disable selection/copy/paste inside the embedded iframe.
    // Works only for same-origin iframes. If cross-origin, we log and attempt a postMessage
    // so cooperating providers can opt-in to disabling selection.
    const iframe = iframeRef.current;
    if (!iframe) return;

    let mounted = true;

    const configureIframe = () => {
      if (!mounted || !iframe) return;
      try {
        const win = iframe.contentWindow as Window | null;
        const doc = iframe.contentDocument || win?.document;
        if (doc && doc.head) {
          // Inject a style to disable user selection
          let style = doc.getElementById('disable-selection-style') as HTMLStyleElement | null;
          if (!style) {
            style = doc.createElement('style');
            style.id = 'disable-selection-style';
            style.textContent = `
              html, body, * {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
                -webkit-touch-callout: none !important;
              }
            `;
            doc.head.appendChild(style);
          }

          // Add event listeners inside iframe to block copy/paste/context menu and keyboard shortcuts
          const onCopy = (e: Event) => {
            e.preventDefault();
            try { win?.postMessage({ type: 'blocked_action', action: 'copy' }, '*'); } catch (er) {}
            return false;
          };
          const onCut = (e: Event) => { e.preventDefault(); try { win?.postMessage({ type: 'blocked_action', action: 'cut' }, '*'); } catch (er) {} return false; };
          const onPaste = (e: Event) => { e.preventDefault(); try { win?.postMessage({ type: 'blocked_action', action: 'paste' }, '*'); } catch (er) {} return false; };
          const onContext = (e: Event) => { e.preventDefault(); try { win?.postMessage({ type: 'blocked_action', action: 'contextmenu' }, '*'); } catch (er) {} return false; };
          const onKey = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && ['c','v','x','a','s','r','u'].includes(key)) {
              e.preventDefault();
              e.stopPropagation();
              try { win?.postMessage({ type: 'blocked_action', action: 'shortcut', key, modifiers: e.ctrlKey ? 'ctrl' : 'meta' }, '*'); } catch (er) {}
              return false;
            }
          };

          // Remove any existing listeners first to avoid duplicates
          try {
            doc.removeEventListener('copy', onCopy as EventListener);
            doc.removeEventListener('cut', onCut as EventListener);
            doc.removeEventListener('paste', onPaste as EventListener);
            doc.removeEventListener('contextmenu', onContext as EventListener);
            doc.removeEventListener('keydown', onKey as any);
          } catch (e) {}

          doc.addEventListener('copy', onCopy as EventListener, true);
          doc.addEventListener('cut', onCut as EventListener, true);
          doc.addEventListener('paste', onPaste as EventListener, true);
          doc.addEventListener('contextmenu', onContext as EventListener, true);
          doc.addEventListener('keydown', onKey as any, true);

          console.log('[FaceProctor] injected disable-selection into iframe (same-origin)');
          return;
        }
      } catch (err) {
        console.warn('[FaceProctor] could not inject into iframe (likely cross-origin):', err);
      }

      // If we reach here, injection failed (likely cross-origin). Send a postMessage
      try {
        iframe.contentWindow?.postMessage({ type: 'disable_selection_request' }, '*');
        console.log('[FaceProctor] posted disable_selection_request to iframe (cross-origin fallback)');
      } catch (e) {
        console.warn('[FaceProctor] postMessage to iframe failed', e);
      }
    };

    // Configure when iframe loads and also attempt immediately (if already loaded)
    iframe.addEventListener('load', configureIframe);
    setTimeout(configureIframe, 200);

    return () => {
      mounted = false;
      try {
        iframe.removeEventListener('load', configureIframe);
      } catch (e) {}
    };
  }, [link]);

  useEffect(() => {
    initFirebaseFromEnv();
    const unsub = onAuthChange((u) => {
      setUserEmail(u?.email ?? null);
    });
    return () => unsub && unsub();
  }, []);

  // Keep a ref with latest cameraPermission and log changes
  const cameraPermissionRef = useRef<'unknown' | 'granted' | 'denied'>(cameraPermission);
  useEffect(() => {
    cameraPermissionRef.current = cameraPermission;
    console.log('[FaceProctor] cameraPermission state ->', cameraPermission);
  }, [cameraPermission]);

  // Global listeners for camera and face events so we can require camera before start
  useEffect(() => {
    const camGranted = () => {
      console.log('[FaceProctor] received cam_permission_granted event');
      setCameraPermission('granted');
      setError(null);
    };
    const camDenied = (e: Event) => {
      const err = (e as CustomEvent)?.detail?.error;
      console.warn('[FaceProctor] received cam_permission_denied event, detail=', err);
      // If Permissions API or our permission state already shows granted, ignore stale denied events
      if (cameraPermissionRef.current === 'granted') {
        console.log('[FaceProctor] Ignoring cam_permission_denied because current permission is granted');
        return;
      }
      setCameraPermission('denied');
      setError('Camera access is required to start the quiz. Please allow camera access.');
    };
    const onFacePresent = () => {
      setFacePresent(true);
      setError(null);
    };
    const onFaceAbsent = () => {
      setFacePresent(false);
    };

    window.addEventListener('cam_permission_granted', camGranted as EventListener);
    window.addEventListener('cam_permission_denied', camDenied as EventListener);
    window.addEventListener('face_present', onFacePresent as EventListener);
    window.addEventListener('face_absent', onFaceAbsent as EventListener);

    return () => {
      window.removeEventListener('cam_permission_granted', camGranted as EventListener);
      window.removeEventListener('cam_permission_denied', camDenied as EventListener);
      window.removeEventListener('face_present', onFacePresent as EventListener);
      window.removeEventListener('face_absent', onFaceAbsent as EventListener);
    };
  }, []);

  // Keep in sync with browser permission state (if supported)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const permsApi = (navigator as any).permissions;
    console.log('[FaceProctor] permissions effect init, permsApi=', !!permsApi);
    let mounted = true;

    async function evaluatePermission() {
      // Try Permissions API first
      if (permsApi && permsApi.query) {
        try {
          const status = await permsApi.query({ name: 'camera' });
          if (!mounted) return;
          const apply = () => {
            console.log('[FaceProctor] permissions status=', status.state);
            if (status.state === 'granted') {
              setCameraPermission('granted');
              try {
                window.dispatchEvent(new CustomEvent('cam_permission_granted'));
              } catch (e) {
                // ignore
              }
            }
            else if (status.state === 'denied') setCameraPermission('denied');
            else setCameraPermission('unknown');
          };
          apply();
          status.onchange = () => {
            console.log('[FaceProctor] permissions onchange ->', status.state);
            apply();
          };
          return;
        } catch (err) {
          console.log('[FaceProctor] permissions.query failed', err);
        }
      }

      // Fallback: use enumerateDevices() to infer whether camera permission is granted
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (!mounted) return;
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          const hasLabel = videoInputs.some((d) => Boolean((d as any).label));
          if (hasLabel) {
            console.log('[FaceProctor] enumerateDevices indicates camera permission granted');
            setCameraPermission('granted');
            try {
              window.dispatchEvent(new CustomEvent('cam_permission_granted'));
            } catch (e) {
              // ignore
            }
          } else {
            // If we previously had granted, keep it; otherwise unknown
            setCameraPermission((prev) => (prev === 'granted' ? 'granted' : 'unknown'));
          }
        } catch (err) {
          console.log('[FaceProctor] enumerateDevices failed', err);
        }
      }
    }

    evaluatePermission();

    const onDeviceChange = () => {
      console.log('[FaceProctor] devicechange event');
      evaluatePermission();
    };
    try {
      if (navigator.mediaDevices && (navigator.mediaDevices as any).addEventListener) {
        (navigator.mediaDevices as any).addEventListener('devicechange', onDeviceChange);
      } else if ((navigator as any).mediaDevices) {
        (navigator as any).mediaDevices.ondevicechange = onDeviceChange;
      }
    } catch (e) {
      // ignore
    }

    return () => {
      mounted = false;
      try {
        if (navigator.mediaDevices && (navigator.mediaDevices as any).removeEventListener) {
          (navigator.mediaDevices as any).removeEventListener('devicechange', onDeviceChange);
        } else if ((navigator as any).mediaDevices) {
          (navigator as any).mediaDevices.ondevicechange = null;
        }
      } catch (e) {
        // ignore
      }
    };
  }, []);

  // Check if student is blocked
  useEffect(() => {
    async function checkBlocked() {
      if (!id) {
        // Nothing to check without a form id
        setBlockedChecked(true);
        return;
      }

      if (!userEmail) {
        setIsBlocked(false);
        // Wait until a user signs in so we can correctly determine blocked status.
        setBlockedChecked(false);
        return;
      }

      try {
        const res = await fetch(`/api/links/${id}/blocked-emails`);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.blockedEmails) ? data.blockedEmails : [];
          const normalized = list.map((e: string) => String(e).toLowerCase().trim());
          const blocked = normalized.includes(userEmail.toLowerCase().trim());
          setIsBlocked(blocked);
          if (blocked) {
            setError('Access denied: You have been blocked due to previous cheating violations. Please contact your teacher.');
          } else {
            // Clear any previous error when user is not blocked
            setError(null);
          }
        } else {
          // If API fails, do not block by default; clear previous blocked state
          setIsBlocked(false);
          setError(null);
        }
      } catch (err) {
        console.error('Error checking blocked status:', err);
        // Don't block access if check fails
      }
      finally {
        setBlockedChecked(true);
      }
    }

    checkBlocked();
  }, [userEmail, id]);

  useEffect(() => {
    if (!id) {
      setError('No form id provided');
      return;
    }

    // Don't load link if student is blocked or blocked status not yet known
    if (!blockedChecked || isBlocked) {
      return;
    }

    async function load() {
      try {
      const res = await fetch(`/api/links/${id}`);
      if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
          setError(errorData.error || 'Link data not available');
        return;
      }
      const entry = await res.json();
        if (!entry || !entry.url) {
          setError('Link not found or invalid');
        return;
      }

      let finalUrl = entry.url as string;
      if (userEmail) {
        try {
          const u = new URL(finalUrl);
          u.searchParams.set('student_email', userEmail);
          finalUrl = u.toString();
        } catch (e) {
          const sep = finalUrl.includes('?') ? '&' : '?';
          finalUrl = `${finalUrl}${sep}student_email=${encodeURIComponent(userEmail)}`;
        }
      }

      setLink(finalUrl);
        setError(null);
      } catch (err: any) {
        console.error('Error loading link:', err);
        setError('Failed to load link. Please try again.');
      }
    }

    load();
  }, [id, userEmail, isBlocked, blockedChecked]);

  // Anti-cheating features - MUST run before early return
  useEffect(() => {
    if (!quizStarted) {
      // Cleanup when quiz is not started
      document.body.classList.remove('fullscreen-mode');
      document.documentElement.classList.remove('fullscreen-mode');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      const style = document.getElementById('anti-cheat-styles');
      if (style) {
        style.remove();
      }
      return;
    }

    console.log('🔒 Anti-cheat features ACTIVATED');

    function sendEvent(payload: Record<string, any>) {
      fetch('/api/logEvent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, studentEmail: userEmail ?? null, ...payload }),
      }).catch(err => console.error('Failed to log event:', err));
    }

    // Removed autoSubmitForm - now using handleSubmitQuiz directly

    function handleViolation(reason: string) {
      // Ignore violations during grace period - check both flag and time
      if (ignoreViolationsRef.current || Date.now() < gracePeriodEndTimeRef.current) {
        console.log('⏸️ Ignoring violation during grace period:', reason);
        return;
      }

      // Prevent duplicate violations from the same event (cooldown period)
      const now = Date.now();
      if (now - lastViolationTimeRef.current < violationCooldownRef.current) {
        console.log('⏸️ Ignoring duplicate violation (cooldown):', reason);
        return;
      }
      lastViolationTimeRef.current = now;

      setViolationCount((prevCount) => {
        const newCount = prevCount + 1;
        sendEvent({ type: 'violation', count: newCount, reason });

        if (newCount === 1) {
          // First violation - show warning (user must acknowledge)
          setShowViolationPopup(true);
        } else if (newCount === 2) {
          // Second violation - show warning (user must acknowledge)
          setShowViolationPopup(true);
        } else if (newCount >= 3) {
          // Third violation - show cheating detected overlay (NO auto-submit, user must click OK)
          setShowCheatingDetected(true);
          handleSubmitQuiz();
          // Report and block the student for this form (fire-and-forget). Only once.
          if (!blockedPostedRef.current && userEmail && id) {
            blockedPostedRef.current = true;
            (async () => {
              try {
                await fetch(`/api/links/${id}/blocked-emails`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: userEmail }),
                });
                // Reflect blocked status in UI
                setIsBlocked(true);
                setError('Access denied: You have been blocked due to previous cheating violations. Please contact your teacher.');
                setBlockedChecked(true);
              } catch (e) {
                console.error('Failed to post blocked email:', e);
              }
            })();
          }
          
        }
        
        return newCount;
      });
    }

    // Track if we're currently focused to detect focus loss
    let isFocused = document.hasFocus();
    let violationTimeout: NodeJS.Timeout | null = null;

    // Listen for custom cheat events (from client-side FaceProctor)
    const violationEventHandler = (e: Event) => {
      try {
        const ev = e as CustomEvent;
        const reason = ev?.detail?.reason ?? 'unknown';
        handleViolation(reason);
      } catch (err) {
        console.warn('cheat_violation handler error', err);
      }
    };
    window.addEventListener('cheat_violation', violationEventHandler as EventListener);

    function checkFocusLoss() {
      // Ignore during grace period - check both flag and time
      if (ignoreViolationsRef.current || Date.now() < gracePeriodEndTimeRef.current) {
        return;
      }
      
      // Don't check focus loss if document is hidden (visibilitychange already handled it)
      if (document.hidden) {
        return;
      }
      
      const currentlyFocused = document.hasFocus();
      if (!currentlyFocused && isFocused && !isSubmitting && !quizSubmitted) {
        console.log('⚠️ Focus lost detected');
        handleViolation('focus_loss');
      }
      isFocused = currentlyFocused;
    }

    function handleVisibility() {
      // Ignore during grace period - check both flag and time
      if (ignoreViolationsRef.current || Date.now() < gracePeriodEndTimeRef.current) {
        return;
      }
      
      const hidden = document.hidden;
      sendEvent({ type: 'visibility', hidden });
      if (hidden && !isSubmitting && !quizSubmitted) {
        console.log('⚠️ Tab switched - violation detected');
        handleViolation('tab_switch');
        // Don't check focus loss here to avoid duplicate violations
        return;
      }
      // Only check focus loss if not hidden (to avoid duplicate violations)
      if (!hidden) {
        checkFocusLoss();
      }
    }

    function handleBlur() {
      // Ignore during grace period - check both flag and time
      if (ignoreViolationsRef.current || Date.now() < gracePeriodEndTimeRef.current) {
        return;
      }
      
      // Don't trigger violation on blur if visibilitychange already handled it
      // The cooldown in handleViolation will prevent duplicates
      if (!isSubmitting && !quizSubmitted && !document.hidden) {
        // If focus moved into the quiz iframe (user clicked the form), treat as non-violation.
        // Use a short timeout to allow document.activeElement to update.
        const maybeIframe = iframeRef.current;
        setTimeout(() => {
          try {
            if (maybeIframe && document.activeElement === maybeIframe) {
              // Click into iframe — not a violation
              console.log('ℹ️ Blur ignored: focus moved into iframe (user click)');
              return;
            }
            console.log('⚠️ Window blur event - violation detected');
            sendEvent({ type: 'blur' });
            if (violationTimeout) clearTimeout(violationTimeout);
            violationTimeout = setTimeout(() => {
              handleViolation('window_blur');
            }, 100);
          } catch (e) {
            // fallback to original behavior on error
            if (violationTimeout) clearTimeout(violationTimeout);
            violationTimeout = setTimeout(() => {
              handleViolation('window_blur');
            }, 100);
          }
        }, 50);
      }
    }

    function handleFocusReturn() {
      // When focus returns, update our tracking
      isFocused = true;
      if (violationTimeout) {
        clearTimeout(violationTimeout);
        violationTimeout = null;
      }
    }

    function handlePageHide() {
      // Ignore during grace period - check both flag and time
      if (ignoreViolationsRef.current || Date.now() < gracePeriodEndTimeRef.current) {
        return;
      }
      
      if (!isSubmitting && !quizSubmitted) {
        console.log('⚠️ Page hide event - violation detected');
        handleViolation('page_hide');
      }
    }

    function handleFullscreenChange() {
      // Ignore during grace period (when entering fullscreen) - check both flag and time
      if ((ignoreViolationsRef.current || Date.now() < gracePeriodEndTimeRef.current) && document.fullscreenElement) {
        return;
      }
      
      if (!document.fullscreenElement && !isSubmitting && !quizSubmitted) {
        console.log('⚠️ Exited fullscreen - violation detected');
        handleViolation('fullscreen_exit');
        // Try to re-enter fullscreen
        setTimeout(async () => {
          try {
            if (containerRef.current) {
              await containerRef.current.requestFullscreen();
            }
          } catch (e) {
            console.warn('Could not re-enter fullscreen');
          }
        }, 100);
      }
    }

    // Periodic focus check (catches cases where events don't fire)
    const focusCheckInterval = setInterval(() => {
      if (quizStarted && !isSubmitting) {
        checkFocusLoss();
      }
    }, 500);

    // Listen for camera / face events
    const camGranted = () => {
      console.log('[FaceProctor] (anti-cheat) cam_permission_granted event');
      setCameraPermission('granted');
    };
    const camDenied = (e?: Event) => {
      const err = (e as CustomEvent)?.detail?.error;
      console.warn('[FaceProctor] (anti-cheat) cam_permission_denied event, detail=', err);
      if (cameraPermissionRef.current === 'granted') {
        console.log('[FaceProctor] (anti-cheat) ignoring cam_permission_denied because current permission is granted');
        return;
      }
      setCameraPermission('denied');
    };
    const onFacePresent = () => setFacePresent(true);
    const onFaceAbsent = () => setFacePresent(false);
    window.addEventListener('cam_permission_granted', camGranted as EventListener);
    window.addEventListener('cam_permission_denied', camDenied as EventListener);
    window.addEventListener('face_present', onFacePresent as EventListener);
    window.addEventListener('face_absent', onFaceAbsent as EventListener);

    function disableSelection(e: Event) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }

    // Prevent text selection on mouse down - COMPLETELY block everything
    function preventSelectionMouseDown(e: MouseEvent | TouchEvent) {
      // Block ALL selection attempts - no exceptions
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Clear any existing selection immediately
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
      if (document.getSelection) {
        document.getSelection()?.removeAllRanges();
      }
      
      return false;
    }

    // Prevent text selection on mouse move while dragging - AGGRESSIVE
    function preventSelectionMouseMove(e: MouseEvent | TouchEvent) {
      // Clear any selection immediately and continuously
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
      if (document.getSelection) {
        document.getSelection()?.removeAllRanges();
      }
      // Also prevent if mouse button is down (MouseEvent) or on touch move (TouchEvent)
      if ('buttons' in e && typeof (e as MouseEvent).buttons === 'number') {
        if ((e as MouseEvent).buttons === 1) {
          e.preventDefault();
        }
      } else if ('touches' in e) {
        // For touch events treat any touch move as active and prevent selection
        (e as TouchEvent).preventDefault();
      }
    }

    // Prevent selection on mouse up - clear any selection
    function preventSelectionMouseUp(e: MouseEvent) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
      if (document.getSelection) {
        document.getSelection()?.removeAllRanges();
      }
      // Also clear selection from document
      if (document.activeElement) {
        (document.activeElement as HTMLElement).blur();
      }
    }

    function blockShortcuts(e: KeyboardEvent) {
      // Block Ctrl+C, Ctrl+V, Ctrl+A, Ctrl+X, Cmd+C, Cmd+V, Cmd+A, Cmd+X
      if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'a', 'x'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log('🚫 Blocked shortcut:', e.key);
        sendEvent({ type: 'blocked_shortcut', key: e.key, modifiers: e.ctrlKey ? 'ctrl' : 'cmd' });
        return false;
      }
      // Block F12, F5, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, Ctrl+R, Ctrl+S
      if (
        e.key === 'F12' ||
        e.key === 'F5' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase())) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's')
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log('🚫 Blocked shortcut:', e.key);
        sendEvent({ type: 'blocked_shortcut', key: e.key });
        return false;
      }
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        sendEvent({ type: 'blocked_print_screen' });
        return false;
      }
    }

    function blockContextMenu(e: MouseEvent) {
      e.preventDefault();
      console.log('🚫 Blocked right-click');
      sendEvent({ type: 'blocked_context_menu' });
      return false;
    }

    // Apply CSS to disable text selection - COMPLETELY disable globally
    const style = document.createElement('style');
    style.id = 'anti-cheat-styles';
    style.textContent = `
      html, body, body *, #fullscreen-quiz-container, #fullscreen-quiz-container * {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
        -webkit-touch-callout: none !important;
        -webkit-user-drag: none !important;
        -khtml-user-select: none !important;
        -webkit-tap-highlight-color: transparent !important;
      }
      #quiz-iframe {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
        pointer-events: auto !important;
      }
      /* Overlay to prevent text selection on iframe */
      #quiz-iframe-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1;
        pointer-events: none;
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
      }
    `;
    document.head.appendChild(style);
    
    // Apply to body and html - COMPLETELY disable
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    
    document.documentElement.style.userSelect = 'none';
    document.documentElement.style.webkitUserSelect = 'none';
    
    if (containerRef.current) {
      containerRef.current.style.userSelect = 'none';
      containerRef.current.style.webkitUserSelect = 'none';
    }

    // Prevent drag and drop
    const dragStartHandler = (e: DragEvent) => {
      e.preventDefault();
      return false;
    };
    const dropHandler = (e: DragEvent) => {
      e.preventDefault();
      return false;
    };
    const dragOverHandler = (e: DragEvent) => {
      e.preventDefault();
      return false;
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      console.log('🚫 Blocked paste');
      sendEvent({ type: 'blocked_paste' });
      return false;
    };

    const handlePrint = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        sendEvent({ type: 'blocked_print' });
      }
    };

    // Add all event listeners
    document.addEventListener('dragstart', dragStartHandler);
    document.addEventListener('drop', dropHandler);
    document.addEventListener('dragover', dragOverHandler);
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('pageshow', handleFocusReturn);
    document.addEventListener('pagehide', handlePageHide);
    window.addEventListener('blur', handleBlur, true); // Use capture phase
    window.addEventListener('focus', handleFocusReturn, true); // Use capture phase
    window.addEventListener('focusout', handleBlur, true); // Additional focus loss detection
    document.addEventListener('selectstart', disableSelection, true);
    document.addEventListener('select', disableSelection, true);
    const handleSelectionChange = () => {
      // Aggressively clear ALL selections immediately
      const selection = window.getSelection();
      if (selection) {
        if (selection.toString().length > 0) {
          selection.removeAllRanges();
        }
      }
      if (document.getSelection) {
        const docSelection = document.getSelection();
        if (docSelection && docSelection.toString().length > 0) {
          docSelection.removeAllRanges();
        }
      }
      // Also try to clear on document.body
      if (document.body) {
        const bodySelection = (document.body as any).getSelection?.();
        if (bodySelection) {
          bodySelection.removeAllRanges();
        }
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange, true);
    document.addEventListener('mousedown', preventSelectionMouseDown, true);
    document.addEventListener('mousemove', preventSelectionMouseMove, true);
    document.addEventListener('mouseup', preventSelectionMouseUp, true);
    // Also prevent on touch devices
    document.addEventListener('touchstart', preventSelectionMouseDown, true);
    document.addEventListener('touchmove', preventSelectionMouseMove, true);
    document.addEventListener('copy', disableSelection, true);
    document.addEventListener('cut', disableSelection, true);
    document.addEventListener('paste', handlePaste, true);
    document.addEventListener('keydown', blockShortcuts, true);
    document.addEventListener('keydown', handlePrint, true);
    document.addEventListener('contextmenu', blockContextMenu, true);

    // Set fullscreen styles
    document.body.classList.add('fullscreen-mode');
    document.documentElement.classList.add('fullscreen-mode');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.body.style.padding = '0';

    return () => {
      clearInterval(focusCheckInterval);
      window.removeEventListener('cheat_violation', violationEventHandler as EventListener);
      if (violationTimeout) clearTimeout(violationTimeout);
      
      document.removeEventListener('dragstart', dragStartHandler);
      document.removeEventListener('drop', dropHandler);
      document.removeEventListener('dragover', dragOverHandler);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('pageshow', handleFocusReturn);
      document.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('blur', handleBlur, true);
      window.removeEventListener('focus', handleFocusReturn, true);
      window.removeEventListener('focusout', handleBlur, true);
      document.removeEventListener('selectstart', disableSelection, true);
      document.removeEventListener('select', disableSelection, true);
      document.removeEventListener('selectionchange', handleSelectionChange, true);
      document.removeEventListener('mousedown', preventSelectionMouseDown, true);
      document.removeEventListener('mousemove', preventSelectionMouseMove, true);
      document.removeEventListener('mouseup', preventSelectionMouseUp, true);
      document.removeEventListener('touchstart', preventSelectionMouseDown, true);
      document.removeEventListener('touchmove', preventSelectionMouseMove, true);
      document.removeEventListener('copy', disableSelection, true);
      document.removeEventListener('cut', disableSelection, true);
      document.removeEventListener('paste', handlePaste, true);
      document.removeEventListener('keydown', blockShortcuts, true);
      document.removeEventListener('keydown', handlePrint, true);
      document.removeEventListener('contextmenu', blockContextMenu, true);
      
      const style = document.getElementById('anti-cheat-styles');
      if (style) {
        style.remove();
      }
      
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      document.body.style.overflow = '';
      document.body.style.margin = '';
      document.body.style.padding = '';
      document.body.classList.remove('fullscreen-mode');
      document.documentElement.classList.remove('fullscreen-mode');
      document.documentElement.style.overflow = '';
    };
  }, [id, userEmail, quizStarted, isSubmitting]);

  async function handleStartQuiz() {
    console.log('▶️ Starting quiz...');

    // Ensure camera permission and face presence before starting
    if (cameraPermission !== 'granted') {
      setError('Please allow camera access before starting the quiz.');
      return;
    }
    if (!facePresent) {
      setError('No face detected. Please position your face in front of the camera before starting.');
      return;
    }
    
    // Set grace period flag and time to ignore violations during fullscreen transition
    ignoreViolationsRef.current = true;
    const gracePeriodDuration = 2000; // 2 seconds grace period
    gracePeriodEndTimeRef.current = Date.now() + gracePeriodDuration;
    
    setShowGuidelines(false);
    setQuizStarted(true);
    
    // Request fullscreen mode
    try {
      if (containerRef.current) {
        await containerRef.current.requestFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      console.log('✅ Fullscreen mode activated');
    } catch (err: any) {
      console.warn('Could not enter fullscreen:', err);
      // Continue anyway - fullscreen might be blocked by browser settings
    }
    
    // Clear grace period after fullscreen transition completes
    setTimeout(() => {
      ignoreViolationsRef.current = false;
      gracePeriodEndTimeRef.current = 0;
      console.log('✅ Grace period ended - anti-cheat fully active');
    }, gracePeriodDuration);
  }

  // When a warning is shown, user must click Continue to acknowledge and (if needed) re-enter fullscreen.
  async function handleContinueFromWarning() {
    // Start a short grace period to ignore violations while we try to enter fullscreen
    ignoreViolationsRef.current = true;
    const gracePeriodDuration = 2000;
    gracePeriodEndTimeRef.current = Date.now() + gracePeriodDuration;

    // Try to enter fullscreen if not already
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current) {
          await containerRef.current.requestFullscreen();
        } else if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      }
    } catch (e) {
      console.warn('Could not enter fullscreen on Continue:', e);
    }

    // Remove the popup
    setShowViolationPopup(false);

    // End grace period after duration
    setTimeout(() => {
      ignoreViolationsRef.current = false;
      gracePeriodEndTimeRef.current = 0;
    }, gracePeriodDuration);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.classList.remove('fullscreen-mode');
      document.documentElement.classList.remove('fullscreen-mode');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  // Central submit function - accessible from anywhere via ref
  const handleSubmitQuiz = React.useCallback(async () => {
    if (isSubmitting || quizSubmitted) {
      console.log('⚠️ Already submitting or submitted, ignoring duplicate call');
      return;
    }
    
    setIsSubmitting(true);
    console.log('🔄 Attempting to submit quiz...');
    
    // Multiple strategies to submit the form
    let submitted = false;
    
    // if (iframeRef.current?.contentWindow) {
    //   // Strategy 1: Try to access iframe document directly
    //   try {
    //     const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
        
    //     // Try various selectors for submit button (Google Forms specific and generic)
    //     const submitSelectors = [
    //       // Google Forms specific
    //       '[jsname="M2UYVd"]', // Google Forms submit button
    //       '.freebirdFormviewerViewNavigationSubmitButton',
    //       '.freebirdFormviewerViewNavigationSubmitButton button',
    //       '#mG61Hd input[type="submit"]',
    //       '#mG61Hd button[type="submit"]',
    //       // Generic form selectors
    //       'input[type="submit"]',
    //       'button[type="submit"]',
    //       'button:not([type])',
    //       '[role="button"][aria-label*="submit" i]',
    //       '[role="button"][aria-label*="send" i]',
    //       'form button[type="submit"]',
    //       'form input[type="submit"]',
    //       'form button:last-child',
    //       '[data-value="Submit"]',
    //       'button[aria-label*="Submit" i]',
    //       // More generic selectors
    //       'button:contains("Submit")',
    //       'button:contains("Send")',
    //       'input[value*="Submit" i]',
    //       'input[value*="Send" i]',
    //       // Try finding by text content
    //       'button',
    //       'input[type="button"]'
    //     ];
        
    //     for (const selector of submitSelectors) {
    //       try {
    //         const submitButton:HTMLInputElement | null = iframeDoc.querySelector(selector);
    //         if (submitButton && submitButton instanceof HTMLElement) {
    //           // Check if it looks like a submit button
    //           const text = submitButton.textContent?.toLowerCase() || '';
    //           const value = (submitButton as HTMLInputElement).value?.toLowerCase() || '';
    //           const ariaLabel = submitButton.getAttribute('aria-label')?.toLowerCase() || '';
              
    //           if (text.includes('submit') || text.includes('send') || 
    //               value.includes('submit') || value.includes('send') ||
    //               ariaLabel.includes('submit') || ariaLabel.includes('send') ||
    //               submitButton.type === 'submit' ||
    //               selector.includes('submit') || selector.includes('M2UYVd')) {
    //             console.log('✅ Found submit button with selector:', selector);
    //             // Try multiple ways to click
    //             submitButton.focus();
    //             submitButton.click();
    //             // Also try mouse events
    //             submitButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    //             submitButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    //             submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    //             // Try keyboard events
    //             submitButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    //             submitButton.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true }));
    //             submitted = true;
    //             // Wait a bit to see if it worked
    //             await new Promise(resolve => setTimeout(resolve, 300));
    //             break;
    //           }
    //         }
    //       } catch (e) {
    //         // Continue to next selector
    //       }
    //     }
        
    //     // Strategy 2: Try form.submit() - MOST RELIABLE for Google Forms
    //     if (!submitted) {
    //       try {
    //         const forms = iframeDoc.querySelectorAll('form');
    //         for (const form of Array.from(forms)) {
    //           try {
    //             console.log('✅ Found form, calling submit()');
    //             (form as HTMLFormElement).submit();
    //             submitted = true;
    //             await new Promise(resolve => setTimeout(resolve, 300));
    //             break;
    //           } catch (e) {
    //             // Try next form
    //           }
    //         }
    //       } catch (e) {
    //         console.warn('Could not submit form directly:', e);
    //       }
    //     }
        
    //     // Strategy 3: Try to trigger submit event
    //     if (!submitted) {
    //       try {
    //         const forms = iframeDoc.querySelectorAll('form');
    //         for (const form of Array.from(forms)) {
    //           try {
    //             const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    //             form.dispatchEvent(submitEvent);
    //             submitted = true;
    //             await new Promise(resolve => setTimeout(resolve, 300));
    //             break;
    //           } catch (e) {
    //             // Try next form
    //           }
    //         }
    //       } catch (e) {
    //         console.warn('Could not dispatch submit event');
    //       }
    //     }
    //   } catch (e) {
    //     console.warn('Cross-origin restrictions prevent direct access to iframe:', e);
    //   }
      
    //   // Strategy 4: Post message to iframe (if it supports it)
    //   if (!submitted && iframeRef.current.contentWindow) {
    //     try {
    //       iframeRef.current.contentWindow.postMessage({ type: 'submitForm', action: 'submit' }, '*');
    //       console.log('📨 Sent postMessage to iframe');
    //       // Give it a moment
    //       await new Promise(resolve => setTimeout(resolve, 500));
    //       // Assume it worked if we can't verify
    //       submitted = true;
    //     } catch (e) {
    //       console.warn('Could not post message to iframe');
    //     }
    //   }
    // }
    
    // Log the submission attempt
    fetch('/api/logEvent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        id, 
        studentEmail: userEmail ?? null, 
        type: 'quiz_submitted',
        violationCount,
        submitted: submitted
      }),
    }).catch(err => console.error('Failed to log submission:', err));
    
    // Mark as submitted
    // setQuizSubmitted(true);
    setIsSubmitting(false);
    // setShowCheatingDetected(false);
    
    if (submitted) {
      console.log('✅ Form submission triggered');
      setSubmittedMessage('Quiz has been submitted successfully.');
    } else {
      console.warn('⚠️ Could not automatically submit form.');
      setSubmittedMessage('Quiz submission attempted. Please verify if the form was submitted.');
    }
    
    // Exit fullscreen
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.warn('Could not exit fullscreen');
    }
    
    // Prevent further interaction - DISABLE EVERYTHING
    if (iframeRef.current) {
      iframeRef.current.style.pointerEvents = 'none';
      iframeRef.current.style.opacity = '0.5';
      iframeRef.current.style.cursor = 'not-allowed';
    }
  }, [id, userEmail, violationCount, isSubmitting, quizSubmitted]);

  // Store submit function in ref so it's accessible from useEffect
  // useEffect(() => {
  //   submitQuizRef.current = handleSubmitQuiz;
  // }, [handleSubmitQuiz]);

  // Render fullscreen iframe when quiz is started
  if (quizStarted && link) {
    return (
      <div 
        ref={containerRef}
        id="fullscreen-quiz-container"
        style={{ 
          width: '100vw',
          height: '100vh',
          margin: 0,
          padding: 0,
          backgroundColor: 'white',
          overflow: 'hidden',
          position: 'relative',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}
      >
        {/* Violation Warning Popup */}
        {showViolationPopup && (
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: '#fef3c7',
              border: '3px solid #f59e0b',
              color: '#92400e',
              padding: '24px 32px',
              borderRadius: '12px',
              zIndex: 100001,
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
              fontSize: '18px',
              fontWeight: 'bold',
              textAlign: 'center',
              maxWidth: '500px',
              animation: 'popupFadeIn 0.3s ease-out'
            }}
          >
            {violationCount === 1 ? (
              <>
                <div style={{ fontSize: '24px', marginBottom: '12px' }}>⚠️</div>
                <div>Warning 1/2: Do not switch tabs or leave this page during the quiz.</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '24px', marginBottom: '12px' }}>⚠️</div>
                <div>Warning 2/2: Next time will result in quiz termination.</div>
              </>
            )}
            <div style={{ marginTop: '18px' }}>
              <button
                onClick={() => {
                  void handleContinueFromWarning();
                }}
                style={{
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Quiz Submitted Message */}
        {/* {quizSubmitted && submittedMessage && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              zIndex: 100003,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'fadeIn 0.3s ease-out'
            }}
          >
            <div
              style={{
                backgroundColor: '#10b981',
                color: 'white',
                padding: '40px 48px',
                borderRadius: '16px',
                textAlign: 'center',
                maxWidth: '600px',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
              <h2 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '16px' }}>
                Quiz Submitted
              </h2>
              <p style={{ fontSize: '18px', marginBottom: '32px', opacity: 0.95 }}>
                {submittedMessage}
              </p>
              <p style={{ fontSize: '14px', opacity: 0.8 }}>
                You can no longer interact with the form.
              </p>
            </div>
          </div>
        )} */}

        {/* Cheating Detected Overlay */}
        {showCheatingDetected && !quizSubmitted && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              zIndex: 100002,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'fadeIn 0.3s ease-out'
            }}
          >
            <div
              style={{
                backgroundColor: '#ef4444',
                color: 'white',
                padding: '40px 48px',
                borderRadius: '16px',
                textAlign: 'center',
                maxWidth: '600px',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>🚫</div>
              <h2 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '16px' }}>
                Cheating Detected
              </h2>
              <p style={{ fontSize: '18px', marginBottom: '32px', opacity: 0.95 }}>
                You have been blocked from continuing the quiz due to multiple violations of the exam rules.
              </p>
              {/* <button
                onClick={() => {
                  if (submitQuizRef.current) {
                    submitQuizRef.current();
                  }
                }}
                disabled={isSubmitting || quizSubmitted}
                style={{
                  backgroundColor: 'white',
                  color: '#ef4444',
                  padding: '14px 32px',
                  borderRadius: '8px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  border: 'none',
                  cursor: (isSubmitting || quizSubmitted) ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.6 : 1,
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {isSubmitting ? 'Submitting...' : quizSubmitted ? 'Submitted' : 'OK'}
              </button> */}
            </div>
          </div>
        )}

        {/* Overlay to prevent text selection on iframe */}
        <div
          id="quiz-iframe-overlay"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 1,
            pointerEvents: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none'
          }}
          onMouseDown={(e) => {
            // Prevent any selection attempts on overlay
            e.preventDefault();
            return false;
          }}
        />
        <iframe
          ref={iframeRef}
          id="quiz-iframe"
          src={link}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            margin: 0,
            padding: 0,
            display: 'block',
            pointerEvents: showCheatingDetected ? 'none' : 'auto',
            position: 'relative',
            zIndex: 0
          }}
          sandbox="allow-forms allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
        />
        {/* Client-side proctoring: hidden video + mediapipe detector (mounted once at page bottom) */}
        {/* Keep the proctor mounted while the quiz is shown so camera stays active */}
        <FaceProctor active={true} maxNumFaces={2} />

        <style jsx>{`
          @keyframes popupFadeIn {
            from {
              opacity: 0;
              transform: translate(-50%, -50%) scale(0.9);
            }
            to {
              opacity: 1;
              transform: translate(-50%, -50%) scale(1);
            }
          }
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-gray-50 via-gray-100 to-white p-8">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="flex items-center justify-between pb-8 border-b border-gray-300">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-800">Student Form</h1>
          </div>
        </header>

        <main className="md:space-y-8 space-y-4">
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
          ) : error ? (
            <div className="mx-auto max-w-4xl p-8">
              <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg">
                <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Form</h3>
                <p className="text-red-700">{error}</p>
                <p className="text-sm text-red-600 mt-4">Please check the link URL or contact your teacher.</p>
              </div>
            </div>
          ) : !link ? (
            <div className="text-center p-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600">Loading form...</p>
            </div>
          ) : showGuidelines ? (
            <div className="mx-auto max-w-4xl md:p-8 p-0">
              <div className="bg-white rounded-lg shadow-lg p-8 space-y-6">
                <h2 className="text-2xl font-bold text-gray-800 text-center">Quiz Guidelines</h2>
                <div className="space-y-4">
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                    <h3 className="font-semibold text-gray-800 mb-3">General Online Form Exam Rules</h3>
                    <ul className="space-y-2 text-gray-700 list-disc list-inside">
                      <li>Do not switch tabs or windows during the exam</li>
                      <li>Do not minimize or close the browser window</li>
                      <li>Do not use copy, paste, or cut shortcuts (Ctrl+C, Ctrl+V, Ctrl+X, Cmd+C, Cmd+V, Cmd+X)</li>
                      <li>Do not open developer tools or inspect element</li>
                      <li>Text selection is disabled during the exam</li>
                      <li>Right-click context menu is disabled</li>
                      <li>The form will be automatically submitted if you switch tabs or lose focus</li>
                      <li>Ensure you have a stable internet connection</li>
                      <li>Ensure your face is visible to the camera — camera access is required</li>
                      <li>Read all questions carefully before answering</li>
                      <li>Complete the form within the allotted time</li>
                    </ul>
                  </div>
                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
                    <p className="text-gray-700 font-medium">
                      <strong>Important:</strong> By clicking "Start Quiz", you acknowledge that you have read and understood all the guidelines above. Any violation of these rules may result in automatic submission of your form.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-center pt-4">
                  <div className="text-sm text-gray-600 mb-2">
                    Camera: <strong className="ml-1">{cameraPermission === 'granted' ? 'Allowed' : cameraPermission === 'denied' ? 'Denied' : 'Not granted'}</strong>
                    <span className="mx-3">•</span>
                    Face: <strong className="ml-1">{facePresent ? 'Detected' : 'Not detected'}</strong>
                  </div>
                  <button
                    onClick={handleStartQuiz}
                    disabled={cameraPermission !== 'granted' || !facePresent}
                    className={`px-8 py-3 text-white text-lg font-semibold rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition transform hover:scale-105 cursor-pointer ${cameraPermission === 'granted' && facePresent ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}`}
                  >
                    Start Quiz
                  </button>
                </div>
              </div>
            </div>
          ) : (
                <div className="mt-4">
              <p className="mb-4 text-base text-gray-600 p-4">The form is embedded below. You may be asked to login by the form provider.</p>
                  <iframe
                    ref={iframeRef}
                    src={link}
                    className="w-full h-[700px] border border-gray-300 rounded-lg shadow-md"
                    sandbox="allow-forms allow-scripts allow-same-origin"
                    referrerPolicy="no-referrer"
                  />
            </div>
          )}
        </main>

        <footer className="pt-8 border-t border-gray-300 text-center text-sm text-gray-500">
          © 2025 Form Shell. All rights reserved.
        </footer>
        {/* Mount proctor during guidelines and quiz so camera is requested early */}
        <FaceProctor active={showGuidelines || quizStarted} maxNumFaces={2} />
      </div>
    </div>
  );
}
