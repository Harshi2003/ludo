"use client";
import dynamic from "next/dynamic";

// The game uses WebGL, audio and the window size, so it renders only in the browser.
export const ClientApp = dynamic(() => import("@/components/App"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <div className="font-display animate-pulse tracking-[.3em] text-muted">FORGING THE REALM…</div>
    </div>
  ),
});
