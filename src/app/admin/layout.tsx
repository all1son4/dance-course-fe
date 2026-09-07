import type { Metadata } from "next";
import type { ReactNode } from "react";

// Auth-gated and deep-linked from the purchase alert: nothing here may be
// prerendered, and the page reads its query string on the first render.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: {
    follow: false,
    index: false,
  },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
