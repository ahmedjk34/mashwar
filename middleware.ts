import createMiddleware from "next-intl/middleware";

import { routing } from "./src/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Include `/` explicitly — the catch-all pattern does not run for the bare root in Next.js,
  // so without this `/` never hits next-intl and resolves to a 404 (no `app/page.tsx`).
  matcher: ["/", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
