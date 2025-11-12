import fs from 'fs/promises';
import path from 'path';

export type LogSeverity = 'info' | 'warning' | 'critical';

export interface LogEvent {
  id: string;
  formId: string | null;
  type: string;
  severity: LogSeverity;
  studentEmail: string | null;
  hidden?: boolean;
  message: string;
  metadata?: Record<string, any>;
  time: string;
}

export interface StudentSummary {
  studentEmail: string | null;
  eventCount: number;
  warnings: number;
  criticals: number;
  lastEvent: string;
  lastMessage: string;
}

export interface FormLogSummary {
  formId: string;
  totalEvents: number;
  totalStudents: number;
  lastEventTime: string | null;
  students: StudentSummary[];
  recentEvents: LogEvent[];
}

const logsPath = path.join(process.cwd(), 'data', 'logs.json');

async function readLogsFile(): Promise<LogEvent[]> {
  try {
    const raw = await fs.readFile(logsPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    return parsed as LogEvent[];
  } catch {
    return [];
  }
}

export async function getFormEvents(formId: string): Promise<LogEvent[]> {
  const logs = await readLogsFile();
  return logs.filter((log) => log.formId === formId);
}

export async function summarizeFormLogs(formId: string): Promise<FormLogSummary> {
  const events = await getFormEvents(formId);
  const studentMap = new Map<string, StudentSummary>();

  events.forEach((event) => {
    const key = (event.studentEmail ?? 'anonymous').toLowerCase();
    if (!studentMap.has(key)) {
      studentMap.set(key, {
        studentEmail: event.studentEmail ?? null,
        eventCount: 0,
        warnings: 0,
        criticals: 0,
        lastEvent: event.time,
        lastMessage: event.message,
      });
    }
    const summary = studentMap.get(key)!;
    summary.eventCount += 1;
    if (event.severity === 'warning') summary.warnings += 1;
    if (event.severity === 'critical') summary.criticals += 1;
    if (new Date(event.time).getTime() > new Date(summary.lastEvent).getTime()) {
      summary.lastEvent = event.time;
      summary.lastMessage = event.message;
    }
  });

  const students = Array.from(studentMap.values()).sort((a, b) => {
    const aScore = a.criticals * 2 + a.warnings;
    const bScore = b.criticals * 2 + b.warnings;
    if (bScore !== aScore) return bScore - aScore;
    return new Date(b.lastEvent).getTime() - new Date(a.lastEvent).getTime();
  });

  return {
    formId,
    totalEvents: events.length,
    totalStudents: studentMap.size,
    lastEventTime: events.length ? events[events.length - 1].time : null,
    students,
    recentEvents: events.slice(-25).reverse(),
  };
}
