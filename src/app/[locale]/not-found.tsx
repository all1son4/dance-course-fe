import Image from "next/image";
import { getTranslations } from "next-intl/server";

import Button from "@/components/common/Button";
import { Logo } from "@/svg";

/*
 * Deliberately a CSS module, not styled-components: unmatched URLs render
 * through the root `app/not-found.tsx`, outside the locale layout - no header
 * (hence the logo below), and the styles styled-components inserts during SSR
 * for server-only components are dropped on hydration there.
 */
import styles from "./not-found.module.css";

export default async function NotFound() {
  const t = await getTranslations("NotFoundPage");
  const destinations = await getTranslations("HomePage.hero.buttons");

  return (
    <div className={styles.container}>
      <div className={styles.logo}>
        <Logo width={264} height={49} inline />
      </div>
      <div className={styles.content}>
        <Image
          src="/images/error404.png"
          alt={t("imageAlt")}
          width={531}
          height={326}
          style={{ width: "100%", maxWidth: "100%", height: "auto" }}
          priority
        />
        <h1 className={styles.errorText}>{t("title")}</h1>
        <Button
          buttonText={t("backHome")}
          width="300px"
          href="/"
          analytics={{ id: "back_home", placement: "not_found" }}
        />
        <div className={styles.secondary}>
          <Button
            buttonText={destinations("online")}
            variant="secondary"
            href="/online"
            analytics={{ id: "explore_online", placement: "not_found" }}
          />
          <Button
            buttonText={destinations("offline")}
            variant="secondary"
            href="/offline"
            analytics={{ id: "explore_offline", placement: "not_found" }}
          />
        </div>
      </div>
    </div>
  );
}
