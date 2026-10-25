import type { Metadata } from 'next';
import { ClientPartyLudo } from './client-party-ludo';
export const metadata: Metadata = { title: 'Afterglow · Sip & Roll' };
export default function Page() { return <ClientPartyLudo />; }
