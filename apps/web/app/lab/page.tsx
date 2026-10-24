import type { Metadata } from "next";
import { ClientLab } from "./client-lab";

export const metadata: Metadata = { title: "Balance Lab — Magic Ludo" };

export default function Page() {
  return <ClientLab />;
}
