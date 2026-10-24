import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Magic Ludo — Battle of the Four Elements",
    short_name: "Magic Ludo",
    description: "An AI-forged Ludo adventure for 2–4 players.",
    start_url: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#0b0820",
    theme_color: "#0b0820",
    categories: ["games"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
