import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-linear-to-b from-gray-50 via-gray-100 to-white p-6">
      <div className="mx-auto max-w-4xl space-y-8 py-28 text-center">
        <header className="pb-6">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Welcome to Form Shell</h1>
          <p className="text-lg text-gray-600 mt-3 leading-relaxed">
            A simple and secure way to share forms with your students.
          </p>
        </header>

        <main className="space-y-8 mb-30">
          <p className="text-base text-gray-700 leading-relaxed">
            Create shareable links for your forms, ensuring your students can access them easily and securely. Manage your links and track their usage from the teacher dashboard.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/teacher">
              <p className="inline-block px-6 py-3 bg-blue-600 text-white text-base font-medium rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 transition">
                Get Started
              </p>
            </Link>
            <Link href="/teacher/dashboard">
              <p className="inline-block px-6 py-3 bg-gray-200 text-gray-800 text-base font-medium rounded-md shadow-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 transition">
                Go to Dashboard
              </p>
            </Link>
          </div>
        </main>

        <footer className="pt-8 border-t border-gray-300 text-sm text-gray-500">
          © 2025 Form Shell. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
