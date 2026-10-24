"use client";
import dynamic from "next/dynamic";

export const ClientCreate = dynamic(() => import("@/components/create/Create"), { ssr: false });
