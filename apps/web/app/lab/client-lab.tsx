"use client";
import dynamic from "next/dynamic";

export const ClientLab = dynamic(() => import("@/components/lab/Lab"), { ssr: false });
