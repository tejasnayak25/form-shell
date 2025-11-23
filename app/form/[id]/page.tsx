"use client";
import { useParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { initFirebaseFromEnv, googleSignIn, onAuthChange } from '../../../lib/firebaseClient';

export default function FormPage() {
  const { id } = useParams() as { id?: string };
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(true);
  const [quizStarted, setQuizStarted] = useState(false);
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
  const submitQuizRef = useRef<(() => Promise<void>) | null>(null); // Ref to submit function

  useEffect(() => {
    initFirebaseFromEnv();
    const unsub = onAuthChange((u) => {
      setUserEmail(u?.email ?? null);
    });
    return () => unsub && unsub();
  }, []);

  // Check if student is blocked
  useEffect(() => {
    async function checkBlocked() {
      if (!userEmail) {
        setIsBlocked(false);
        return;
      }

      try {
        const res = await fetch(`/api/blocked-emails?email=${encodeURIComponent(userEmail)}`);
        if (res.ok) {
          const data = await res.json();
          setIsBlocked(data.isBlocked || false);
          if (data.isBlocked) {
            setError('Access denied: You have been blocked due to previous cheating violations. Please contact your teacher.');
          }
        }
      } catch (err) {
        console.error('Error checking blocked status:', err);
        // Don't block access if check fails
      }
    }

    checkBlocked();
  }, [userEmail]);

  useEffect(() => {
    if (!id) {
      setError('No form id provided');
      return;
    }

    // Don't load link if student is blocked
    if (isBlocked) {
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
  }, [id, userEmail, isBlocked]);

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
          // First violation - show warning
          setShowViolationPopup(true);
          setTimeout(() => setShowViolationPopup(false), 5000);
        } else if (newCount === 2) {
          // Second violation - show warning
          setShowViolationPopup(true);
          setTimeout(() => setShowViolationPopup(false), 5000);
        } else if (newCount >= 3) {
          // Third violation - show cheating detected overlay (NO auto-submit, user must click OK)
          setShowCheatingDetected(true);
        }
        
        return newCount;
      });
    }

    // Track if we're currently focused to detect focus loss
    let isFocused = document.hasFocus();
    let violationTimeout: NodeJS.Timeout | null = null;

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
        console.log('⚠️ Window blur event - violation detected');
        sendEvent({ type: 'blur' });
        // Use a small delay to avoid duplicate violations
        if (violationTimeout) clearTimeout(violationTimeout);
        violationTimeout = setTimeout(() => {
          handleViolation('window_blur');
        }, 100);
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

    function disableSelection(e: Event) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }

    // Prevent text selection on mouse down - COMPLETELY block everything
    function preventSelectionMouseDown(e: MouseEvent) {
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
    function preventSelectionMouseMove(e: MouseEvent) {
      // Clear any selection immediately and continuously
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
      if (document.getSelection) {
        document.getSelection()?.removeAllRanges();
      }
      // Also prevent if mouse button is down
      if (e.buttons === 1) {
        e.preventDefault();
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
    document.body.style.MozUserSelect = 'none';
    document.body.style.msUserSelect = 'none';
    document.body.style.webkitTouchCallout = 'none';
    document.body.style.webkitUserDrag = 'none';
    document.body.style.webkitTapHighlightColor = 'transparent';
    
    document.documentElement.style.userSelect = 'none';
    document.documentElement.style.webkitUserSelect = 'none';
    
    if (containerRef.current) {
      containerRef.current.style.userSelect = 'none';
      containerRef.current.style.webkitUserSelect = 'none';
      containerRef.current.style.MozUserSelect = 'none';
      containerRef.current.style.msUserSelect = 'none';
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
      document.body.style.MozUserSelect = '';
      document.body.style.msUserSelect = '';
      document.body.style.webkitTouchCallout = '';
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
    
    if (iframeRef.current?.contentWindow) {
      // Strategy 1: Try to access iframe document directly
      try {
        const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
        
        // Try various selectors for submit button (Google Forms specific and generic)
        const submitSelectors = [
          // Google Forms specific
          '[jsname="M2UYVd"]', // Google Forms submit button
          '.freebirdFormviewerViewNavigationSubmitButton',
          '.freebirdFormviewerViewNavigationSubmitButton button',
          '#mG61Hd input[type="submit"]',
          '#mG61Hd button[type="submit"]',
          // Generic form selectors
          'input[type="submit"]',
          'button[type="submit"]',
          'button:not([type])',
          '[role="button"][aria-label*="submit" i]',
          '[role="button"][aria-label*="send" i]',
          'form button[type="submit"]',
          'form input[type="submit"]',
          'form button:last-child',
          '[data-value="Submit"]',
          'button[aria-label*="Submit" i]',
          // More generic selectors
          'button:contains("Submit")',
          'button:contains("Send")',
          'input[value*="Submit" i]',
          'input[value*="Send" i]',
          // Try finding by text content
          'button',
          'input[type="button"]'
        ];
        
        for (const selector of submitSelectors) {
          try {
            const submitButton = iframeDoc.querySelector(selector);
            if (submitButton && submitButton instanceof HTMLElement) {
              // Check if it looks like a submit button
              const text = submitButton.textContent?.toLowerCase() || '';
              const value = (submitButton as HTMLInputElement).value?.toLowerCase() || '';
              const ariaLabel = submitButton.getAttribute('aria-label')?.toLowerCase() || '';
              
              if (text.includes('submit') || text.includes('send') || 
                  value.includes('submit') || value.includes('send') ||
                  ariaLabel.includes('submit') || ariaLabel.includes('send') ||
                  submitButton.type === 'submit' ||
                  selector.includes('submit') || selector.includes('M2UYVd')) {
                console.log('✅ Found submit button with selector:', selector);
                // Try multiple ways to click
                submitButton.focus();
                submitButton.click();
                // Also try mouse events
                submitButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                submitButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                // Try keyboard events
                submitButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
                submitButton.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true }));
                submitted = true;
                // Wait a bit to see if it worked
                await new Promise(resolve => setTimeout(resolve, 300));
                break;
              }
            }
          } catch (e) {
            // Continue to next selector
          }
        }
        
        // Strategy 2: Try form.submit() - MOST RELIABLE for Google Forms
        if (!submitted) {
          try {
            const forms = iframeDoc.querySelectorAll('form');
            for (const form of Array.from(forms)) {
              try {
                console.log('✅ Found form, calling submit()');
                (form as HTMLFormElement).submit();
                submitted = true;
                await new Promise(resolve => setTimeout(resolve, 300));
                break;
              } catch (e) {
                // Try next form
              }
            }
          } catch (e) {
            console.warn('Could not submit form directly:', e);
          }
        }
        
        // Strategy 3: Try to trigger submit event
        if (!submitted) {
          try {
            const forms = iframeDoc.querySelectorAll('form');
            for (const form of Array.from(forms)) {
              try {
                const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                form.dispatchEvent(submitEvent);
                submitted = true;
                await new Promise(resolve => setTimeout(resolve, 300));
                break;
              } catch (e) {
                // Try next form
              }
            }
          } catch (e) {
            console.warn('Could not dispatch submit event');
          }
        }
      } catch (e) {
        console.warn('Cross-origin restrictions prevent direct access to iframe:', e);
      }
      
      // Strategy 4: Post message to iframe (if it supports it)
      if (!submitted && iframeRef.current.contentWindow) {
        try {
          iframeRef.current.contentWindow.postMessage({ type: 'submitForm', action: 'submit' }, '*');
          console.log('📨 Sent postMessage to iframe');
          // Give it a moment
          await new Promise(resolve => setTimeout(resolve, 500));
          // Assume it worked if we can't verify
          submitted = true;
        } catch (e) {
          console.warn('Could not post message to iframe');
        }
      }
    }
    
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
    setQuizSubmitted(true);
    setIsSubmitting(false);
    setShowCheatingDetected(false);
    
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
  useEffect(() => {
    submitQuizRef.current = handleSubmitQuiz;
  }, [handleSubmitQuiz]);

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
          </div>
        )}

        {/* Quiz Submitted Message */}
        {quizSubmitted && submittedMessage && (
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
        )}

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
                Your quiz will now be submitted.
              </p>
              <button
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
              </button>
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
            <div className="mx-auto max-w-4xl p-8">
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
                <div className="flex justify-center pt-4">
                  <button
                    onClick={handleStartQuiz}
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition transform hover:scale-105"
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
      </div>
    </div>
  );
}
