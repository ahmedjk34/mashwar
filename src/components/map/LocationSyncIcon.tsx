import type { SVGProps } from "react";

export default function LocationSyncIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d="M12 3.75c-3.59 0-6.5 2.91-6.5 6.5 0 4.64 6.5 10 6.5 10s6.5-5.36 6.5-10c0-3.59-2.91-6.5-6.5-6.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10.25" r="2.1" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M6.8 4.9c-1.38 1.17-2.18 2.95-2.18 4.95"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M4.2 6.4 4 9.86l3.27-.28"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.2 19.1c1.38-1.17 2.18-2.95 2.18-4.95"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M19.8 17.6 20 14.14l-3.27.28"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
