"use client";
import dynamic from "next/dynamic";

export const ClientOnline = dynamic(() => import("@/components/online/Online"), { ssr: false });
