"use client";

import { useState } from "react";

import type { StatusMessage } from "../lib/admin.types";

export const useCopyLink = ({
  onStatus,
}: {
  onStatus: (status: StatusMessage) => void;
}) => {
  const [copyingUrl, setCopyingUrl] = useState("");

  const copyLink = async (link: string) => {
    if (!link || copyingUrl) {
      return;
    }

    setCopyingUrl(link);

    try {
      await navigator.clipboard.writeText(link);
      onStatus({
        text: "Ссылка скопирована.",
        tone: "success",
      });
    } catch {
      onStatus({
        text: "Не удалось скопировать автоматически. Скопируй ссылку вручную.",
        tone: "error",
      });
    } finally {
      setCopyingUrl("");
    }
  };

  return { copyingUrl, copyLink };
};
