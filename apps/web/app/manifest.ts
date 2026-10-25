import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dicebound · Race the Realms",
    short_name: "Dicebound",
    description: "Squad battles across living kingdoms for 2 to 4 players.",
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
