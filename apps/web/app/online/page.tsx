import type { Metadata } from "next";
import { ClientOnline } from "./client-online";

export const metadata: Metadata = { title: "Play online · Dicebound" };

export default function Page() {
  return <ClientOnline />;
}
