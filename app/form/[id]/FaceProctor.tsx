"use client";
import React, { useEffect, useRef } from 'react';
import createFaceMeshDetector from '../../../lib/mediapipeClient';
import { estimateHeadRotation, CheatDetector } from '../../../lib/cheatDetector';

type Props = {
  active?: boolean;
  maxNumFaces?: number;
};

export default function FaceProctor({ active = true, maxNumFaces = 2 }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<any>(null);
  const cheatRef = useRef<CheatDetector | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const lastMultiPersonRef = useRef(0);
  const facePresentRef = useRef(false);
  const faceAbsentSinceRef = useRef<number | null>(null);
  const gazeAwaySinceRef = useRef<number | null>(null);
  const gazeWarningShownRef = useRef(false);

  useEffect(() => {
    if (!active) return;

    let mounted = true;

    // video element (will be attached once we have stream). Show a small preview
    const v = document.createElement('video');
    v.style.display = 'block';
    v.style.position = 'fixed';
    v.style.bottom = '12px';
    v.style.right = '12px';
    v.style.width = '160px';
    v.style.height = '120px';
    v.style.zIndex = '100000';
    v.style.border = '2px solid rgba(0,0,0,0.12)';
    v.style.borderRadius = '8px';
    v.style.objectFit = 'cover';
    v.autoplay = true;
    v.playsInline = true;
    v.muted = true;
    videoRef.current = v;

    cheatRef.current = new CheatDetector();
    cheatRef.current.onLookAway = (r) => {
      try {
        window.dispatchEvent(new CustomEvent('cheat_violation', { detail: { reason: 'look_away', rotation: r } }));
      } catch (e) {
        // ignore
      }
    };
    cheatRef.current.onNod = (r) => {
      try {
        window.dispatchEvent(new CustomEvent('cheat_violation', { detail: { reason: 'nod', rotation: r } }));
      } catch (e) {
        // ignore
      }
    };

    let stream: MediaStream | null = null;
    const isStartingRef = { current: false } as { current: boolean };

    // keywords that likely indicate iframe/read-aloud content or answers
    const suspiciousKeywords = [
      'answer', 'question', 'option', 'submit', 'choice', 'true', 'false', 'a', 'b', 'c', 'd', 'option', 'next', 'previous'
    ];

    async function requestCameraAndStart() {
      console.log('FaceProctor: requestCameraAndStart()');
      if (isStartingRef.current) return;
      isStartingRef.current = true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        // attach video and add to DOM
        videoRef.current!.srcObject = stream;
        document.body.appendChild(v);
        try {
          await v.play();
        } catch (e) {
          console.log('FaceProctor: video.play() blocked or failed', e);
          // ignore autoplay blocking; video element still has stream
        }

        // notify permission granted
        window.dispatchEvent(new CustomEvent('cam_permission_granted'));

        // start detector
        let frameCount = 0;
        try {
          detectorRef.current = await createFaceMeshDetector(v, {
          onFrame: (results: any) => {
            const faces = results.multiFaceLandmarks ?? [];
            frameCount++;
            if (frameCount % 30 === 0) {
              try {
                console.log('FaceProctor: frame', frameCount, 'faces=', faces.length);
              } catch (e) {
                // ignore
              }
            }
            if (faces.length > 0) {
              // face present
              if (!facePresentRef.current) {
                facePresentRef.current = true;
                faceAbsentSinceRef.current = null;
                window.dispatchEvent(new CustomEvent('face_present'));
              }
              // push rotation for cheat detection
              if (cheatRef.current) {
                try {
                  const rot = estimateHeadRotation(faces[0]);
                  cheatRef.current.push(rot);
                } catch (e) {
                  // ignore per-frame errors
                }
              }

              // Estimate gaze (best-effort). Use iris landmarks if available,
              // otherwise fallback to eye corner centers. We'll compute a
              // normalized gaze offset (gx, gy) where 0,0 = center, +x = right, +y = down.
              try {
                const landmarks = faces[0];
                const estimateGaze = (lm: any) => {
                  // iris indices in MediaPipe: 468-477 (both irises)
                  const irisIndices = Array.from({ length: 10 }, (_, i) => 468 + i);
                  const hasIris = irisIndices.every(i => !!lm[i]);
                  const leftEyeIdx = [33, 133, 160, 159, 158, 144];
                  const rightEyeIdx = [362, 263, 387, 386, 385, 373];

                  const avg = (ids: number[]) => {
                    const pts = ids.map(i => lm[i] ?? lm[0]);
                    const s = pts.reduce((acc: any, p: any) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
                    return { x: s.x / pts.length, y: s.y / pts.length };
                  };

                  const leftCenter = avg(leftEyeIdx);
                  const rightCenter = avg(rightEyeIdx);
                  const eyeMid = { x: (leftCenter.x + rightCenter.x) / 2, y: (leftCenter.y + rightCenter.y) / 2 };

                  let irisCenter: { x: number; y: number } | null = null;
                  if (hasIris) {
                    // average all iris points as a single center (rough)
                    const pts = irisIndices.map(i => lm[i]);
                    const s = pts.reduce((acc: any, p: any) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
                    irisCenter = { x: s.x / pts.length, y: s.y / pts.length };
                  } else {
                    // fallback: approximate iris center by average of inner eye corners and mid-eye
                    irisCenter = { x: eyeMid.x, y: eyeMid.y };
                  }

                  // Eye box width (approx) used to normalize gaze offsets
                  const eyeWidth = Math.hypot(rightCenter.x - leftCenter.x, rightCenter.y - leftCenter.y) || 1e-6;
                  const gx = (irisCenter.x - eyeMid.x) / eyeWidth; // negative = left, positive = right
                  const gy = (irisCenter.y - eyeMid.y) / eyeWidth; // negative = up, positive = down
                  return { gx, gy };
                };

                const gaze = estimateGaze(landmarks);
                // Define permissive boundaries: looking across screen allowed up to ~0.35 horizontally
                // Relaxed slightly from 0.45 to 0.35 to be more sensitive while avoiding false positives
                const horizBoundary = 0.35; // normalized units (fraction of eye width)
                const vertBoundary = 0.6; // vertical boundary is more permissive

                // Debug: log gaze occasionally
                if (frameCount % 15 === 0) {
                  try {
                    console.log('FaceProctor: gaze debug ->', { gx: gaze.gx.toFixed(3), gy: gaze.gy.toFixed(3), horizBoundary, vertBoundary });
                  } catch (e) {}
                }

                const beyond = Math.abs(gaze.gx) > horizBoundary || Math.abs(gaze.gy) > vertBoundary;
                if (beyond) {
                  if (!gazeAwaySinceRef.current) gazeAwaySinceRef.current = Date.now();
                  // sustained beyond threshold for > 1200ms => violation
                  if (gazeAwaySinceRef.current && Date.now() - gazeAwaySinceRef.current > 1200) {
                    // avoid repeating same violation rapidly
                    if (!gazeWarningShownRef.current) {
                      gazeWarningShownRef.current = true;
                      try {
                        window.dispatchEvent(new CustomEvent('cheat_violation', { detail: { reason: 'gaze_away', gaze } }));
                      } catch (e) {}
                    }
                  }
                } else {
                  gazeAwaySinceRef.current = null;
                  gazeWarningShownRef.current = false;
                }
              } catch (e) {
                // ignore gaze estimation errors
              }
            } else {
              // no faces in this frame
              if (facePresentRef.current && faceAbsentSinceRef.current === null) {
                faceAbsentSinceRef.current = Date.now();
              }
              // if absent for > 1500ms, consider face absent
              if (faceAbsentSinceRef.current && Date.now() - faceAbsentSinceRef.current > 1500) {
                if (facePresentRef.current) {
                  facePresentRef.current = false;
                  window.dispatchEvent(new CustomEvent('face_absent'));
                }
              }
            }
          },
          onMultiPerson: (count: number) => {
            // debounce multi-person events to avoid spam
            const now = Date.now();
            if (count > 1 && now - lastMultiPersonRef.current > 2000) {
              lastMultiPersonRef.current = now;
              try {
                window.dispatchEvent(new CustomEvent('cheat_violation', { detail: { reason: 'multi_person', count } }));
              } catch (e) {
                // ignore
              }
            }
          }
          }, { maxNumFaces });
          console.log('FaceProctor: createFaceMeshDetector resolved, detectorRef set');
            // start microphone & speech recognition in parallel (best-effort)
            startSpeechRecognitionIfAvailable();
        } catch (detErr) {
          console.error('FaceProctor: createFaceMeshDetector failed', detErr);
          try {
            window.dispatchEvent(new CustomEvent('cam_detector_failed', { detail: { error: String(detErr) } }));
          } catch (e) {}
          // don't treat this as permission denied; stop starting process
          return;
        }
        
      } catch (err: any) {
        console.warn('FaceProctor: camera permission denied or failed', err);
        window.dispatchEvent(new CustomEvent('cam_permission_denied', { detail: { error: String(err) } }));
      } finally {
        isStartingRef.current = false;
      }
    }

    async function startSpeechRecognitionIfAvailable() {
      // Don't start twice
      if (recognitionRef.current) return;

      // Try to ensure we have mic permission first so SpeechRecognition isn't blocked
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = micStream;
      } catch (e) {
        // mic permission denied or unavailable - emit event and return
        try { window.dispatchEvent(new CustomEvent('mic_permission_denied', { detail: { error: String(e) } })); } catch (er) {}
        return;
      }

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        try { window.dispatchEvent(new CustomEvent('speech_recognition_unavailable')); } catch (e) {}
        return;
      }

      try {
        const recog = new SpeechRecognition();
        recog.continuous = true;
        recog.interimResults = false;
        recog.lang = 'en-US';

        recog.onstart = () => {
          try { window.dispatchEvent(new CustomEvent('mic_permission_granted')); } catch (e) {}
        };

        recog.onerror = (ev: any) => {
          console.warn('FaceProctor: SpeechRecognition error', ev);
        };

        recog.onresult = (ev: any) => {
          try {
            const results = ev.results;
            let transcript = '';
            for (let i = ev.resultIndex; i < results.length; ++i) {
              transcript += results[i][0].transcript + ' ';
            }
            transcript = transcript.trim();
            if (!transcript) return;
            console.log('FaceProctor: speech transcript ->', transcript);
            // Emit transcript globally so other modules (page.tsx) can inspect
            try { window.dispatchEvent(new CustomEvent('speech_transcript', { detail: { transcript } })); } catch (e) {}

            // Simple keyword detection to flag suspicious speech (best-effort)
            const low = transcript.toLowerCase();
            const words = low.split(/\W+/).filter(Boolean);
            const found = words.find(w => suspiciousKeywords.includes(w));
            if (found) {
              console.log('FaceProctor: suspicious speech detected ->', found);
              try {
                window.dispatchEvent(new CustomEvent('cheat_violation', { detail: { reason: 'speech_from_iframe', transcript } }));
              } catch (e) {}
            }
          } catch (e) {
            console.warn('FaceProctor: onresult handler error', e);
          }
        };

        recog.onend = () => {
          // attempt to restart if still active
          if (active) {
            try { recog.start(); } catch (e) {}
          }
        };

        recog.start();
        recognitionRef.current = recog;
      } catch (e) {
        console.warn('FaceProctor: could not start SpeechRecognition', e);
      }
    }

    requestCameraAndStart();

    // Retry starting when permissions flip to granted elsewhere
    const onCamGranted = () => {
      // If we don't have an active detector/stream, try again
      if (!detectorRef.current && !isStartingRef.current) {
        requestCameraAndStart();
      }
    };
    window.addEventListener('cam_permission_granted', onCamGranted as EventListener);

    return () => {
      mounted = false;
      try {
        detectorRef.current?.stop?.();
      } catch (e) {
        // ignore
      }
      // stop speech recognition
      try {
        if (recognitionRef.current) {
          try { recognitionRef.current.onresult = null; } catch (e) {}
          try { recognitionRef.current.onend = null; } catch (e) {}
          try { recognitionRef.current.stop(); } catch (e) {}
          recognitionRef.current = null;
        }
      } catch (e) {}
      // stop audio tracks
      try {
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(t => t.stop());
          audioStreamRef.current = null;
        }
      } catch (e) {}
      try {
        cheatRef.current?.clear?.();
      } catch (e) {
        // ignore
      }
      if (videoRef.current && videoRef.current.parentElement) {
        videoRef.current.parentElement.removeChild(videoRef.current);
      }
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      window.removeEventListener('cam_permission_granted', onCamGranted as EventListener);
    };
  }, [active, maxNumFaces]);

  return null;
}
