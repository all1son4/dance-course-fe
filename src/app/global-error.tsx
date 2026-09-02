"use client";

import { useEffect, useState } from "react";

/**
 * Replaces the root layout when it fails to render, so nothing of the app -
 * fonts, providers, translations, styled-components - can be assumed here.
 * Plain markup and inline styles only. The locale routing keeps the URL
 * prefix-free, so the visitor's language comes from the NEXT_LOCALE cookie
 * next-intl maintains; without it the site default (en) applies.
 */

const GLOBAL_ERROR_COPY = {
  en: {
    description: "An unexpected error occurred. Trying again usually fixes it.",
    retry: "Try again",
    title: "Something went wrong",
  },
  pl: {
    description: "Wystąpił nieoczekiwany błąd. Zwykle pomaga spróbować ponownie.",
    retry: "Spróbuj ponownie",
    title: "Coś poszło nie tak",
  },
  ru: {
    description:
      "Произошла непредвиденная ошибка. Попробуйте ещё раз — обычно это помогает.",
    retry: "Попробовать снова",
    title: "Что-то пошло не так",
  },
} as const;

type GlobalErrorLocale = keyof typeof GLOBAL_ERROR_COPY;

const detectLocale = (): GlobalErrorLocale => {
  if (typeof document === "undefined") {
    return "en";
  }

  const cookieLocale = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("NEXT_LOCALE="))
    ?.slice("NEXT_LOCALE=".length);

  if (cookieLocale && cookieLocale in GLOBAL_ERROR_COPY) {
    return cookieLocale as GlobalErrorLocale;
  }

  const languagePrefix = navigator.language?.slice(0, 2);

  return languagePrefix && languagePrefix in GLOBAL_ERROR_COPY
    ? (languagePrefix as GlobalErrorLocale)
    : "en";
};

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const [locale] = useState(detectLocale);
  const copy = GLOBAL_ERROR_COPY[locale];

  useEffect(() => {
    console.error("Global error boundary", error);
  }, [error]);

  return (
    <html lang={locale}>
      <body
        style={{
          alignItems: "center",
          background: "rgb(255 255 255)",
          color: "rgb(0 0 0)",
          display: "flex",
          fontFamily: "system-ui, -apple-system, sans-serif",
          justifyContent: "center",
          margin: 0,
          minHeight: "100dvh",
          padding: "0 20px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "540px" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 400, margin: "0 0 8px" }}>
            {copy.title}
          </h1>
          <p style={{ fontSize: "16px", margin: "0 0 24px", opacity: 0.7 }}>
            {copy.description}
          </p>
          <button
            onClick={() => retry()}
            style={{
              background: "rgb(0 0 0)",
              border: "none",
              borderRadius: "100px",
              color: "rgb(255 255 255)",
              cursor: "pointer",
              fontSize: "16px",
              padding: "14px 34px",
            }}
            type="button"
          >
            {copy.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
