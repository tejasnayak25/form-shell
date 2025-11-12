export type AntiCheatEventType = 'pose' | 'visibility' | 'blur' | 'duplicate' | 'heartbeat';

export type AlertLevel = 'info' | 'warning' | 'critical';

export interface AntiCheatEvent {
  id: string;
  type: AntiCheatEventType;
  timestamp: number;
  level: AlertLevel;
  message: string;
  metadata?: Record<string, any>;
}

export interface AntiCheatSessionState {
  blurCount: number;
  hiddenCount: number;
  lastHiddenAt?: number;
  lastPoseConfidence: number;
  blocked: boolean;
  duplicateDetected: boolean;
  botScore: number;
}

const DEFAULT_STATE: AntiCheatSessionState = {
  blurCount: 0,
  hiddenCount: 0,
  lastPoseConfidence: 0,
  blocked: false,
  duplicateDetected: false,
  botScore: 0,
};

export function initialAntiCheatState(): AntiCheatSessionState {
  return { ...DEFAULT_STATE };
}

export function updateSessionState(state: AntiCheatSessionState, event: AntiCheatEvent): AntiCheatSessionState {
  const next: AntiCheatSessionState = { ...state };

  switch (event.type) {
    case 'blur':
      next.blurCount += 1;
      next.botScore += 1;
      break;
    case 'visibility':
      if (event.metadata?.hidden) {
        next.hiddenCount += 1;
        next.lastHiddenAt = event.timestamp;
      } else {
        next.lastHiddenAt = undefined;
      }
      if (event.metadata?.hidden) {
        next.botScore += 1;
      }
      break;
    case 'pose':
      next.lastPoseConfidence = Number(event.metadata?.confidence ?? 0);
      if (event.metadata?.flagged) {
        next.botScore += 2;
      } else {
        next.botScore = Math.max(0, next.botScore - 1);
      }
      break;
    case 'duplicate':
      next.duplicateDetected = true;
      next.blocked = true;
      next.botScore += 3;
      break;
    case 'heartbeat':
      // keep-alive/checkpoint event; reset mild penalties
      next.botScore = Math.max(0, next.botScore - 0.5);
      break;
    default:
      break;
  }

  // Auto-block when botScore crosses threshold or repeated blur events occur
  if (next.botScore >= 8 || next.blurCount >= 6 || next.hiddenCount >= 6) {
    next.blocked = true;
  }

  return next;
}

export function shouldLockForm(state: AntiCheatSessionState): boolean {
  if (state.blocked || state.duplicateDetected) return true;
  if (state.lastPoseConfidence < 0.35) return true;
  return false;
}

export function deriveAlertLevel(event: AntiCheatEvent): AlertLevel {
  return event.level;
}

export function createEvent(
  type: AntiCheatEventType,
  level: AlertLevel,
  message: string,
  metadata?: Record<string, any>,
): AntiCheatEvent {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    type,
    timestamp: Date.now(),
    level,
    message,
    metadata,
  };
}
