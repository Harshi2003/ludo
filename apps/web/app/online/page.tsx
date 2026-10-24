import type { Metadata } from "next";
import { ClientOnline } from "./client-online";

export const metadata: Metadata = { title: "Play online — AI Ludo" };

export default function Page() {
  return <ClientOnline />;
}
