"use client";

import { useEffect } from "react";

export default function FailedPageGuard() {
  useEffect(() => {
    document.body.setAttribute("data-hide-footer", "true");
    document.body.setAttribute("data-payment-result", "true");
    const setResultViewportHeight = () => {
      document.documentElement.style.setProperty(
        "--payment-result-vh",
        `${window.innerHeight}px`,
      );
    };

    setResultViewportHeight();
    window.addEventListener("resize", setResultViewportHeight);
    window.addEventListener("orientationchange", setResultViewportHeight);
    window.visualViewport?.addEventListener("resize", setResultViewportHeight);

    return () => {
      document.body.removeAttribute("data-hide-footer");
      document.body.removeAttribute("data-payment-result");
      window.removeEventListener("resize", setResultViewportHeight);
      window.removeEventListener("orientationchange", setResultViewportHeight);
      window.visualViewport?.removeEventListener("resize", setResultViewportHeight);
      document.documentElement.style.removeProperty("--payment-result-vh");
    };
  }, []);

  return null;
}
