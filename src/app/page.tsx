import type { Metadata } from "next";

import MashwarHome from "@/components/map/MashwarHome";

export const metadata: Metadata = {
  title: "Mashwar Map Base",
  description: "MapLibre-based West Bank map foundation for Mashwar.",
};

export default function Home() {
  return <MashwarHome />;
}
