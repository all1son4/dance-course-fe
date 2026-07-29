import Image from "next/image";
import { getTranslations } from "next-intl/server";

import Button from "@/components/common/Button";
import { Logo } from "@/svg";

import styles from "./not-found.module.css";

export default async function NotFound() {
  const t = await getTranslations("NotFoundPage");

  return (
    <div className={styles.container}>
      <div className={styles.logo}>
        <Logo width={264} height={49} />
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
        <p className={styles.errorText}>{t("title")}</p>
        <Button buttonText={t("backHome")} width="300px" href="/" />
      </div>
    </div>
  );
}
