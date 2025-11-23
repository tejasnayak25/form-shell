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
  const lastMultiPersonRef = useRef(0);
  const facePresentRef = useRef(false);
  const faceAbsentSinceRef = useRef<number | null>(null);

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
