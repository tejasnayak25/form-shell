"use client";

export interface AlertItem {
  id: string;
  message: string;
  level: 'info' | 'warning' | 'critical';
  timestamp: number;
  metadata?: Record<string, any>;
}

interface RealTimeAlertsProps {
  alerts: AlertItem[];
  onDismiss?: (id: string) => void;
}

const levelStyles: Record<AlertItem['level'], string> = {
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

const levelLabel: Record<AlertItem['level'], string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
};

export function RealTimeAlerts({ alerts, onDismiss }: RealTimeAlertsProps) {
  if (!alerts.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500 shadow-sm">
        No suspicious activity detected.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts
        .slice(-4)
        .reverse()
        .map((alert) => (
          <div
            key={alert.id}
            className={`rounded-lg border px-4 py-3 text-sm shadow-sm transition ${levelStyles[alert.level]}`}
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold text-xs uppercase tracking-wide">{levelLabel[alert.level]}</div>
              <div className="text-xs">{new Date(alert.timestamp).toLocaleTimeString()}</div>
            </div>
            <p className="mt-1 text-sm">{alert.message}</p>
            {onDismiss && (
              <button
                className="mt-2 text-xs text-gray-500 underline"
                onClick={() => onDismiss(alert.id)}
                type="button"
              >
                dismiss
              </button>
            )}
          </div>
        ))}
    </div>
  );
}
