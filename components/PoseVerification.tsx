"use client";

import { useEffect, useRef, useState } from 'react';

export type VerificationLevel = 'idle' | 'tracking' | 'warning' | 'blocked';

export interface VerificationStatus {
  ready: boolean;
  faceVisible: boolean;
  confidence: number;
  level: VerificationLevel;
  flagged: boolean;
  message?: string;
  lastUpdated: number;
}

interface PoseVerificationProps {
  onStatusChange?: (status: VerificationStatus) => void;
  paused?: boolean;
}

const DEFAULT_STATUS: VerificationStatus = {
  ready: false,
  faceVisible: false,
  confidence: 0,
  level: 'idle',
  flagged: false,
  lastUpdated: Date.now(),
};

export function PoseVerification({ onStatusChange, paused }: PoseVerificationProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<VerificationStatus>(DEFAULT_STATUS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let camera: any;
    let pose: any;
    let cancelled = false;

    async function init() {
      if (!videoRef.current) return;
      try {
        const [{ Pose }, { Camera }] = await Promise.all([
          import('@mediapipe/pose'),
          import('@mediapipe/camera_utils'),
        ]);

        pose = new Pose({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });
        pose.setOptions({
          modelComplexity: 0,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          selfieMode: true,
        });

        pose.onResults((results: any) => {
          if (!results || cancelled) return;
          const nextStatus = evaluateResults(results);
          setStatus(nextStatus);
          onStatusChange?.(nextStatus);
          drawResults(results);
        });

        camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (paused || cancelled) return;
            await pose.send({ image: videoRef.current });
          },
          width: 480,
          height: 360,
        });

        await camera.start();
        setStatus((prev) => ({ ...prev, ready: true }));
      } catch (e: any) {
        console.error('Pose init error', e);
        setError('Unable to start camera or Mediapipe');
      }
    }

    init();

    function drawResults(results: any) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      if (results.poseLandmarks) {
        ctx.fillStyle = 'rgba(59,130,246,0.7)';
        results.poseLandmarks.forEach((landmark: any) => {
          ctx.beginPath();
          ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 4, 0, 2 * Math.PI);
          ctx.fill();
        });
      }
      ctx.restore();
    }

    return () => {
      cancelled = true;
      camera?.stop?.();
      pose?.close?.();
    };
  }, [onStatusChange, paused]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Live Verification</p>
          <p className="text-xs text-gray-500">
            Keep your face centered and visible. Confidence: {(status.confidence * 100).toFixed(0)}%
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            status.flagged
              ? 'bg-red-100 text-red-700'
              : status.faceVisible
              ? 'bg-green-100 text-green-700'
              : 'bg-yellow-100 text-yellow-700'
          }`}
        >
          {status.flagged ? 'Flagged' : status.faceVisible ? 'Tracking' : 'Searching'}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} className="h-60 w-full object-cover" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>

      {status.message && <p className="text-xs text-red-600">{status.message}</p>}
    </div>
  );
}

function evaluateResults(results: any): VerificationStatus {
  const base: VerificationStatus = {
    ...DEFAULT_STATUS,
    ready: true,
    lastUpdated: Date.now(),
  };
  const landmarks = results?.poseLandmarks;
  if (!landmarks || landmarks.length === 0) {
    return {
      ...base,
      message: 'Face not detected. Please stay within the frame.',
    };
  }

  const criticalIndexes = [0, 2, 5]; // nose + eyes
  const visibilities = criticalIndexes
    .map((idx) => landmarks[idx])
    .filter(Boolean)
    .map((lm: any) => lm.visibility ?? 0);
  const confidence = visibilities.reduce((sum: number, v: number) => sum + v, 0) / (visibilities.length || 1);

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  let flagged = false;
  let message = '';
  if (!leftShoulder || !rightShoulder) {
    flagged = true;
    message = 'Upper body not visible. Stay within frame.';
  } else {
    const zDiff = Math.abs(leftShoulder.z - rightShoulder.z);
    const xDiff = Math.abs(leftShoulder.x - rightShoulder.x);
    if (zDiff > 0.25 || xDiff < 0.05) {
      flagged = true;
      message = 'Please face the camera directly.';
    }
  }

  if (confidence < 0.45) {
    flagged = true;
    message = 'Low confidence in facial tracking.';
  }

  return {
    ready: true,
    faceVisible: confidence >= 0.6 && !flagged,
    confidence,
    level: flagged ? 'blocked' : confidence >= 0.75 ? 'tracking' : 'warning',
    flagged,
    message: flagged ? message : undefined,
    lastUpdated: Date.now(),
  };
}
