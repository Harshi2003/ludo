'use client';
import dynamic from 'next/dynamic';
export const ClientPartyLudo = dynamic(() => import('@/components/party-ludo/PartyLudo'), { ssr: false });
