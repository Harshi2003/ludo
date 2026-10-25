"use client";
import { useEffect, useState } from "react";

/** Keep both game HUDs and their cameras on the same orientation breakpoint. */
export function useGameViewport() {
  const [viewport, setViewport] = useState({ w: 1280, h: 800 });
  useEffect(() => {
    const resize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const portrait = viewport.h > viewport.w;
  return { ...viewport, portrait, desktop: viewport.w >= 1024 && !portrait };
}
