"use client";

import { useId } from "react";
import { createPortal } from "react-dom";

import RouteLoadingCard, {
  type RouteLoadingMessageNamespace,
} from "@/components/map/RouteLoadingCard";

interface RouteBuildingOverlayProps {
  open: boolean;
  messageNamespace?: RouteLoadingMessageNamespace;
}

export default function RouteBuildingOverlay({
  open,
  messageNamespace = "home.route.loadingModal",
}: RouteBuildingOverlayProps) {
  const reactId = useId();
  const safeId = reactId.replace(/:/g, "");
  const titleId = `route-building-title-${safeId}`;
  const descId = `route-building-desc-${safeId}`;

  if (!open || typeof document === "undefined") {
    return null;
  }

  const inner = (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-[var(--clr-black)]/55 p-4 backdrop-blur-[6px]"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className="w-full max-w-[min(100%,380px)]">
        <RouteLoadingCard
          messageNamespace={messageNamespace}
          titleId={titleId}
          descId={descId}
          className="shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        />
      </div>
    </div>
  );

  return createPortal(inner, document.body);
}
