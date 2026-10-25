import type { Metadata } from "next";
import { ClientCreate } from "./client-create";

export const metadata: Metadata = { title: "Forge a World · Dicebound" };

export default function Page() {
  return <ClientCreate />;
}
