"use client";

import { useEffect } from "react";

export default function FailedPageGuard() {
  useEffect(() => {
    document.body.setAttribute("data-hide-footer", "true");

    return () => {
      document.body.removeAttribute("data-hide-footer");
    };
  }, []);

  return null;
}
