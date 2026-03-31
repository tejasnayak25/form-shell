/* Cheat detection helpers
   - estimateHeadRotation: approximate yaw/pitch/roll from face landmarks
   - CheatDetector: keep a rolling history and detect suspicious motions

   Notes:
   - The landmark indices used are typical for MediaPipe FaceMesh but
     may need tuning depending on the chosen model options.
*/

type Landmark = { x: number; y: number; z?: number };

export type Rotation = { yaw: number; pitch: number; roll: number; timestamp: number };

function avgPoints(points: Landmark[]) {
  const s = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: (acc.z ?? 0) + (p.z ?? 0) }),
    { x: 0, y: 0, z: 0 }
  );
  const n = points.length || 1;
  return { x: s.x / n, y: s.y / n, z: (s.z ?? 0) / n };
}

// Estimate yaw/pitch/roll (in degrees) from a *single* face's landmarks array.
// landmarks: Array of {x,y,z} normalized coordinates from MediaPipe FaceMesh
export function estimateHeadRotation(landmarks: Landmark[]): Rotation {
  if (!landmarks || landmarks.length === 0) {
    return { yaw: 0, pitch: 0, roll: 0, timestamp: Date.now() };
  }

  // Typical face mesh indices (may need adjustments):
  const leftEyeIdx = [33, 133, 160, 159];
  const rightEyeIdx = [362, 263, 387, 386];
  const noseIdx = 1; // approximate tip of the nose

  const left = avgPoints(leftEyeIdx.map((i) => landmarks[i] ?? landmarks[0]));
  const right = avgPoints(rightEyeIdx.map((i) => landmarks[i] ?? landmarks[0]));
  const nose = landmarks[noseIdx] ?? landmarks[1] ?? landmarks[0];

  const midEyeX = (left.x + right.x) / 2;
  const midEyeY = (left.y + right.y) / 2;

  // Eye-distance used as a scale factor
  const eyeDx = right.x - left.x;
  const eyeDy = right.y - left.y;
  const eyeDist = Math.hypot(eyeDx, eyeDy) || 1e-6;

  // yaw: left/right rotation (nose's x relative to eye midpoint)
  const yaw = (Math.atan2(nose.x - midEyeX, eyeDist) * 180) / Math.PI;

  // pitch: up/down rotation (nose's y relative to eye midpoint)
  const pitch = (Math.atan2(nose.y - midEyeY, eyeDist) * 180) / Math.PI;

  // roll: tilt (angle between eyes)
  const roll = (Math.atan2(eyeDy, eyeDx) * 180) / Math.PI;

  return { yaw, pitch, roll, timestamp: Date.now() };
}

// Simple rolling detector for suspicious head movement and multi-person
export class CheatDetector {
  private history: Rotation[] = [];
  private maxHistory = 20;
  private yawThreshold = 25; // degrees to consider 'looking away'
  private nodThreshold = 15; // degrees change in pitch considered a nod
  private nodWindowMs = 1200; // time window to interpret repeated nods
  private lookAwayCooldownMs = 1500;
  private nodCooldownMs = 1500;
  private lastLookAwayTs = 0;
  private lastNodTs = 0;

  onLookAway?: (rot: Rotation) => void;
  onNod?: (rot: Rotation) => void;

  constructor(opts?: Partial<{ maxHistory: number; yawThreshold: number; nodThreshold: number; nodWindowMs: number }>) {
    if (opts?.maxHistory) this.maxHistory = opts.maxHistory;
    if (opts?.yawThreshold) this.yawThreshold = opts.yawThreshold;
    if (opts?.nodThreshold) this.nodThreshold = opts.nodThreshold;
    if (opts?.nodWindowMs) this.nodWindowMs = opts.nodWindowMs;
    // optional cooldowns
    // @ts-ignore allow passing extra options without creating a new type
    if ((opts as any)?.lookAwayCooldownMs) this.lookAwayCooldownMs = (opts as any).lookAwayCooldownMs;
    if ((opts as any)?.nodCooldownMs) this.nodCooldownMs = (opts as any).nodCooldownMs;
  }

  push(rot: Rotation) {
    this.history.push(rot);
    if (this.history.length > this.maxHistory) this.history.shift();
    this.checkLookAway(rot);
    this.checkNod(rot);
  }

  private checkLookAway(rot: Rotation) {
    const now = Date.now();
    if (Math.abs(rot.yaw) > this.yawThreshold && now - this.lastLookAwayTs > this.lookAwayCooldownMs) {
      this.lastLookAwayTs = now;
      this.onLookAway?.(rot);
    }
  }

  private checkNod(rot: Rotation) {
    // Count pitch sign changes or large pitch deltas in recent window
    const now = Date.now();
    const window = this.history.filter((r) => now - r.timestamp <= this.nodWindowMs);
    if (window.length < 2) return;
    // compute max delta in pitch
    let maxDelta = 0;
    for (let i = 1; i < window.length; i++) {
      const d = Math.abs(window[i].pitch - window[i - 1].pitch);
      if (d > maxDelta) maxDelta = d;
    }
    if (maxDelta > this.nodThreshold && now - this.lastNodTs > this.nodCooldownMs) {
      this.lastNodTs = now;
      this.onNod?.(rot);
    }
  }

  clear() {
    this.history = [];
  }
}

export default { estimateHeadRotation, CheatDetector };
