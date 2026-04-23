import type { Metadata } from "next";

import MapHome from "@/components/map/MapHome";

export const metadata: Metadata = {
  title: "Mashwar Map Base",
  description: "MapLibre-based West Bank map foundation for Mashwar.",
};

export default function Home() {
  return <MapHome />;
}
