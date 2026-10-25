import type { Metadata, Viewport } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";

const display = Cinzel({ variable: "--font-display", subsets: ["latin"], weight: ["500", "700", "900"] });
const sans = Inter({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dicebound · Race the Realms",
  description: "Command a squad of legends, race rival houses across living kingdoms and claim the throne. Land on a rival and they fall. Stand together and your powers combine.",
  applicationName: "Dicebound",
  appleWebApp: { capable: true, title: "Dicebound", statusBarStyle: "black-translucent" },
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
