const NEXT_PUBLIC_DEBUG_FLAG = process.env.NEXT_PUBLIC_MASHWAR_DEBUG_ROUTING;

export function isRoutingDebugEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    NEXT_PUBLIC_DEBUG_FLAG === "1" ||
    NEXT_PUBLIC_DEBUG_FLAG === "true"
  );
}

export function logRoutingDebug(label: string, payload: unknown): void {
  if (!isRoutingDebugEnabled()) {
    return;
  }

  console.log(`[Mashwar routing] ${label}`, payload);
}
