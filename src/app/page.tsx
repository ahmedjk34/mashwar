import { redirect } from "next/navigation";

import { routing } from "@/i18n/routing";

/** Fallback when `/` is not handled by middleware (e.g. matcher edge cases). */
export default function RootRedirectPage() {
  redirect(`/${routing.defaultLocale}`);
}
