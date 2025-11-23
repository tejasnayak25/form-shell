# Cheat detection (MediaPipe) — module notes

This folder provides a small client-side helper to run MediaPipe FaceMesh
and simple algorithms to detect multi-person presence and suspicious head
movements (looking away, nodding). It's intended as a starting point —
tune thresholds and logic for your use case and privacy policies.

Files added
- `lib/mediapipeClient.ts` — dynamic client helper that starts the camera,
  runs FaceMesh, and emits `onFrame` and `onMultiPerson` callbacks.
- `lib/cheatDetector.ts` — utility functions:
  - `estimateHeadRotation(landmarks)` returns approximate yaw/pitch/roll.
  - `CheatDetector` class maintains a small history and triggers
    `onLookAway` and `onNod` callbacks when thresholds are exceeded.

Install

Run this in your project root (Next.js client-side code):

```powershell
npm install @mediapipe/face_mesh @mediapipe/camera_utils
```

Usage (React client component)

1. Ensure the component is a client component (add `"use client"` at top).
2. Create a `video` element (hidden or visible) and pass it to `createFaceMeshDetector`.
3. Use the `cheatDetector` to process landmarks and react to events.

Minimal example:

```tsx
"use client";
import { useEffect, useRef } from 'react';
import createFaceMeshDetector from '@/lib/mediapipeClient';
import { estimateHeadRotation, CheatDetector } from '@/lib/cheatDetector';

export default function FaceProctor() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let detector: any = null;
    const cheat = new CheatDetector();
    cheat.onLookAway = (r) => console.log('look away', r);
    cheat.onNod = (r) => console.log('nod detected', r);

    (async () => {
      if (!videoRef.current) return;
      detector = await createFaceMeshDetector(videoRef.current, {
        onFrame: (results) => {
          const faces = results.multiFaceLandmarks ?? [];
          if (faces.length > 0) {
            const rot = estimateHeadRotation(faces[0]);
            cheat.push(rot);
          }
        },
        onMultiPerson: (count) => {
          if (count > 1) console.log('multiple people detected', count);
        },
      }, { maxNumFaces: 2 });
    })();

    return () => {
      detector?.stop?.();
      cheat.clear();
    };
  }, []);

  return <video ref={videoRef} style={{ display: 'none' }} autoPlay playsInline />;
}
```

Privacy & accuracy notes
- This module runs in the user's browser and only uses camera frames locally.
- The heuristics are approximate; tune `CheatDetector` thresholds and the
  FaceMesh `minDetectionConfidence` / `minTrackingConfidence` for your
  environment and camera quality.

Next steps
- Integrate into `app/form/[id]/page.tsx` as a client component and show
  visual feedback or warnings when cheating is suspected.
- Add server-side logging (with user consent) and an options page to tune
  thresholds per environment.
