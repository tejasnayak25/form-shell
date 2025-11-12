"use client";

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import {
  Activity,
  BadgeCheck,
  Camera,
  Lock,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';

const ROLE_STORAGE_KEY = 'form-shell-role';

function rememberRole(role: 'teacher' | 'student') {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ROLE_STORAGE_KEY, role);
}

export default function Home() {
  const router = useRouter();

  const features = useMemo(
    () => [
      {
        title: 'Secure Shell',
        description: 'Forced fullscreen, anti-tab switching, and duplicate session detection keep exams contained.',
        icon: ShieldCheck,
      },
      {
        title: 'Live Pose Tracking',
        description: 'Mediapipe-powered verification pauses forms when students leave camera view.',
        icon: Camera,
      },
      {
        title: 'Real-time Alerts',
        description: 'Blur, visibility, and verification events stream into your dashboard instantly.',
        icon: Activity,
      },
      {
        title: 'Teacher Dashboard',
        description: 'Create secure links, monitor incidents, approve retries, and manage logs.',
        icon: BadgeCheck,
      },
      {
        title: 'Student Portal',
        description: 'Simple access code entry with guided steps to sign in and stay compliant.',
        icon: UserCheck,
      },
      {
        title: 'Tamper Evidence',
        description: 'Every suspicious action is recorded and surfaced for post-exam audits.',
        icon: Lock,
      },
    ],
    [],
  );

  function handleTeacherLogin() {
    rememberRole('teacher');
    router.push('/teacher');
  }

  function handleStudentLogin() {
    rememberRole('student');
    router.push('/student');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="relative isolate overflow-hidden">
        <div className="absolute inset-0 opacity-40">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.35),_transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(236,72,153,0.25),_transparent_60%)]" />
        </div>

        <div className="relative z-10 px-6 py-16 sm:px-10 lg:px-16">
          <header className="mx-auto max-w-5xl text-center space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-slate-200">
              <Sparkles className="h-3 w-3 text-amber-300" />
              Form Shell 2.0
            </div>
            <h1 className="text-4xl font-extrabold leading-tight text-white sm:text-5xl">
              Secure, monitor, and protect every online exam attempt.
            </h1>
            <p className="text-base text-slate-300 sm:text-lg">
              Form Shell wraps Google Forms with fullscreen enforcement, Mediapipe verification, and real-time teacher controls so remote
              assessments stay honest.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              <button
                onClick={handleTeacherLogin}
                className="rounded-2xl bg-white px-6 py-3 text-base font-semibold text-slate-900 shadow-lg shadow-amber-500/30 transition hover:-translate-y-0.5 hover:bg-amber-50"
              >
                Teacher Login
              </button>
              <button
                onClick={handleStudentLogin}
                className="rounded-2xl border border-white/40 px-6 py-3 text-base font-semibold text-white backdrop-blur transition hover:-translate-y-0.5 hover:border-white"
              >
                Student Login
              </button>
            </div>
          </header>

          <section className="mx-auto mt-16 max-w-6xl">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.title} className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20 backdrop-blur">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-white/10 p-2">
                      <feature.icon className="h-5 w-5 text-amber-300" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                  </div>
                  <p className="mt-3 text-sm text-slate-200">{feature.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mx-auto mt-16 grid max-w-6xl gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl shadow-blue-900/40 backdrop-blur">
              <h2 className="text-2xl font-bold text-white">Teacher workflow</h2>
              <p className="mt-3 text-sm text-slate-200">
                Create shareable shells, watch live incidents, and approve retries with one click.
              </p>
              <ul className="mt-5 space-y-3 text-sm text-slate-100">
                <li>• Paste Google Form link, auto-sanitize, and share the secure URL.</li>
                <li>• Monitor blur, fullscreen exits, and pose alerts in real time.</li>
                <li>• Grant or revoke access for any student directly from the dashboard.</li>
              </ul>
              <button
                onClick={handleTeacherLogin}
                className="mt-6 inline-flex items-center justify-center rounded-2xl bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-amber-300"
              >
                Go to Teacher Console
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl shadow-blue-900/40 backdrop-blur">
              <h2 className="text-2xl font-bold text-white">Student workflow</h2>
              <p className="mt-3 text-sm text-slate-200">
                Enter your exam code, grant camera access, and stay in fullscreen while Form Shell keeps you compliant.
              </p>
              <ul className="mt-5 space-y-3 text-sm text-slate-100">
                <li>• Forced fullscreen with exit protection and session locking.</li>
                <li>• Google sign-in ties submission identity to anti-cheat logs.</li>
                <li>• Instructor approval automatically unlocks paused sessions.</li>
              </ul>
              <button
                onClick={handleStudentLogin}
                className="mt-6 inline-flex items-center justify-center rounded-2xl border border-white/40 px-5 py-2 text-sm font-semibold text-white hover:border-white"
              >
                Go to Student Portal
              </button>
            </div>
          </section>

          <footer className="mx-auto mt-20 max-w-4xl border-t border-white/10 pt-6 text-center text-sm text-slate-400">
            © {new Date().getFullYear()} Form Shell. Built for educators, trusted by students.
          </footer>
        </div>
      </div>
    </div>
  );
}
