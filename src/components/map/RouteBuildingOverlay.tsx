"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import RouteLoadingCard, {
  type RouteLoadingMessageNamespace,
} from "@/components/map/RouteLoadingCard";

const EXIT_MS = 220;

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

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(raf);
    }

    setVisible(false);
    const timer = window.setTimeout(() => {
      setMounted(false);
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  const inner = (
    <div
      className={`fixed inset-0 z-[2000] flex items-center justify-center bg-[var(--clr-black)]/55 p-4 backdrop-blur-[6px] transition-opacity ease-out ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      style={{ transitionDuration: `${EXIT_MS}ms` }}
      role="dialog"
      aria-modal="true"
      aria-busy={mounted ? "true" : "false"}
      aria-live="polite"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div
        className={`w-full max-w-[min(100%,380px)] transition ease-out will-change-transform ${
          visible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-2 scale-[0.97] opacity-0"
        }`}
        style={{ transitionDuration: `${EXIT_MS}ms` }}
      >
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
