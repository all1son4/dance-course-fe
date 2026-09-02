"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import Button from "@/components/common/Button";

/*
 * A CSS module rather than styled-components: this screen exists for the case
 * where rendering just failed, so it should not depend on the styling runtime
 * that may have been involved in the failure.
 */
import styles from "./error.module.css";

/**
 * Last-resort boundary for the locale segment. Expected degraded states (a
 * closed or unreadable catalogue) render their own notices and never reach
 * this; what lands here is an unanticipated rendering failure. `retry`
 * re-fetches and re-renders the segment, which is the right recovery for the
 * transient causes - the header and footer around it stay mounted.
 */
export default function LocaleError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("Common.errorPage");

  useEffect(() => {
    // The digest ties this rendering to the matching server-side log entry.
    console.error("Locale segment error boundary", error);
  }, [error]);

  return (
    <section className={styles.section}>
      <h1 className={styles.title}>{t("title")}</h1>
      <p className={styles.description}>{t("description")}</p>
      <div className={styles.actions}>
        <Button buttonText={t("retryButton")} width="300px" onClick={() => retry()} />
        <Button
          buttonText={t("backHome")}
          variant="secondary"
          width="300px"
          href="/"
          prefetch={false}
        />
      </div>
    </section>
  );
}
