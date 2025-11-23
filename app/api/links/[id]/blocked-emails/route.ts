import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { firestore } from '@/lib/firebase';

async function readLinksFile() {
	const linksPath = path.join(process.cwd(), 'data', 'links.json');
	if (!fs.existsSync(linksPath)) return {};
	const raw = fs.readFileSync(linksPath, 'utf-8');
	try {
		return JSON.parse(raw || '{}');
	} catch (e) {
		console.error('Failed to parse links.json', e);
		return {};
	}
}

function writeLinksFile(data: Record<string, any>) {
	const linksPath = path.join(process.cwd(), 'data', 'links.json');
	fs.writeFileSync(linksPath, JSON.stringify(data, null, 2));
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const rawId = (await params).id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		if (!id) return NextResponse.json({ error: 'form id is required' }, { status: 400 });

        console.log(id);
		// Try Firebase first (optional)
		try {
			const firebase = await import('@/lib/firebase');
			const rootCollection = firebase.rootCollection;
			if (rootCollection) {
				const docRef = rootCollection.doc('system').collection('forms').doc(id);
				const doc = await docRef.get();
				if (doc.exists) {
					  const data = doc.data() || {};
					  const blockedEmails = Array.isArray((data as any).blockedEmails) ? (data as any).blockedEmails : [];
					return NextResponse.json({ id, blockedEmails });
				}
			}
		} catch (e) {
			// Firebase optional - fallback to JSON
		}

		// Fallback to JSON
		const links = await readLinksFile();
		const entry = links[id];
		if (!entry) return NextResponse.json({ error: 'form not found' }, { status: 404 });
		const blockedEmails = Array.isArray(entry.blockedEmails) ? entry.blockedEmails : [];
		return NextResponse.json({ id, blockedEmails });
	} catch (err) {
		console.error('Error in GET blocked-emails:', err);
		return NextResponse.json({ error: 'internal' }, { status: 500 });
	}
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const rawId = (await params).id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		if (!id) return NextResponse.json({ error: 'form id is required' }, { status: 400 });

		const body = await req.json().catch(() => ({}));
		const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : null;
		if (!email) {
			return NextResponse.json({ error: 'email is required' }, { status: 400 });
		}

		// Try Firebase update first
		try {
			const firebase = await import('@/lib/firebase');
			const rootCollection = firebase.rootCollection;
			if (rootCollection) {
				const docRef = rootCollection.doc('system').collection('forms').doc(id);
                await docRef.set({
                    blockedEmails: firestore.FieldValue.arrayUnion(email)
                }, {
                    merge: true
                });
				return NextResponse.json({ success: true, id, email, message: 'Email added to blocked list' });
			}
		} catch (e) {
			// ignore and fallback to JSON file
            console.log(e);
		}

		// Fallback to JSON file update
		const links = await readLinksFile();
		const entry = links[id];
		if (!entry) return NextResponse.json({ error: 'form not found' }, { status: 404 });
		if (!Array.isArray(entry.blockedEmails)) entry.blockedEmails = [];
		if (!entry.blockedEmails.includes(email)) {
			entry.blockedEmails.push(email);
			links[id] = entry;
			writeLinksFile(links);
			return NextResponse.json({ success: true, id, email, message: 'Email added to blocked list' });
		}

		return NextResponse.json({ success: true, id, email, message: 'Email already blocked' });
	} catch (err) {
		console.error('Error in POST blocked-emails:', err);
		return NextResponse.json({ error: 'internal' }, { status: 500 });
	}
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const rawId = (await params).id;
		const id = Array.isArray(rawId) ? rawId[0] : rawId;
		if (!id) return NextResponse.json({ error: 'form id is required' }, { status: 400 });

		// read email from body or query
		let email: string | null = null;
		try {
			const body = await req.json().catch(() => ({}));
			if (body && typeof body.email === 'string') email = body.email.toLowerCase().trim();
		} catch (e) {
			// ignore
		}
		if (!email) {
			try {
				const url = new URL(req.url);
				const q = url.searchParams.get('email');
				if (q) email = q.toLowerCase().trim();
			} catch (e) {}
		}

		if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 });

		// Try Firebase update first
		try {
			const firebase = await import('@/lib/firebase');
			const rootCollection = firebase.rootCollection;
			if (rootCollection) {
				const docRef = rootCollection.doc('system').collection('forms').doc(id);
				await docRef.set({
					blockedEmails: firestore.FieldValue.arrayRemove(email)
				}, { merge: true });
				return NextResponse.json({ success: true, id, email, message: 'Email removed from blocked list' });
			}
		} catch (e) {
			// ignore and fallback to JSON file
			console.log(e);
		}

		// Fallback to JSON file update
		const links = await readLinksFile();
		const entry = links[id];
		if (!entry) return NextResponse.json({ error: 'form not found' }, { status: 404 });
		if (!Array.isArray(entry.blockedEmails)) entry.blockedEmails = [];
		const before = Array.isArray(entry.blockedEmails) ? entry.blockedEmails.length : 0;
		entry.blockedEmails = entry.blockedEmails.filter((e: string) => e.toLowerCase().trim() !== email);
		links[id] = entry;
		writeLinksFile(links);
		const after = entry.blockedEmails.length;
		if (after === before) {
			return NextResponse.json({ success: false, message: 'Email not found in blocked list' });
		}
		return NextResponse.json({ success: true, id, email, message: 'Email removed from blocked list' });
	} catch (err) {
		console.error('Error in DELETE blocked-emails:', err);
		return NextResponse.json({ error: 'internal' }, { status: 500 });
	}
}
