This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

Custom additions for this workspace (form-shell):

- `lib/sanitize.ts` - utility to extract URL from pasted embed HTML or raw URL.
- `app/api/createLink/route.ts` - API to create short id for a sanitized URL and store it via Firestore (when configured) or `data/links.json` fallback.
- `app/api/logEvent/route.ts` - API to accept anti-cheat events and append to `data/logs.json`.
- `app/teacher/page.tsx` - teacher UI to paste embed code and create link.
- `app/form/[id]/page.tsx` - student page which embeds the external URL and logs visibility/blur events.
- `lib/firebaseClient.ts` - minimal firebase helper (placeholder). Update with your Firebase config.
- `app/teacher/dashboard/page.tsx` - teacher dashboard to list and delete links created by the signed-in teacher.
- `app/api/teacher/links` - API endpoints to list and delete teacher links (now uses Firestore instead of JSON file storage).

How to run locally

1. Install dependencies:

```powershell
npm install
```

2. (Optional) Add Firebase config if you want Google sign-in, and update `lib/firebaseClient.ts` or use your own.

3. Run dev server:

```powershell
npm run dev
```

Notes and limitations

- This is a minimal prototype. The server-side code writes to JSON files under `data/` and is not safe for concurrent production use.
- For production you should store links and logs in a proper database (Firestore, Postgres, etc.) and secure API endpoints with authentication.
- The app uses a naive anti-cheat approach (visibility and blur events) which can be bypassed and may generate false positives. Use proctoring services for stronger protection.
