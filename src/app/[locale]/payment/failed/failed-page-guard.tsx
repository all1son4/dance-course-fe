"use client";

import { useEffect } from "react";

export default function FailedPageGuard() {
  useEffect(() => {
    document.body.setAttribute("data-hide-footer", "true");
    document.body.setAttribute("data-payment-result", "true");

    return () => {
      document.body.removeAttribute("data-hide-footer");
      document.body.removeAttribute("data-payment-result");
    };
  }, []);

  return null;
}
