import type { Metadata, Viewport } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";

const display = Cinzel({ variable: "--font-display", subsets: ["latin"], weight: ["500", "700", "900"] });
const sans = Inter({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Magic Ludo — Battle of the Four Elements",
  description: "An AI-forged Ludo adventure. Four elemental guardians race and battle to the Crystal Castle.",
  applicationName: "Magic Ludo",
  appleWebApp: { capable: true, title: "Magic Ludo", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b0820",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
