"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { Chevron } from "@/svg";

import {
  Flag,
  Item,
  ItemLabel,
  Menu,
  MenuWrap,
  Trigger,
  TriggerLabel,
} from "./LanguageSelect.styles";
import { LanguageOption } from "./LanguageSelect.types";

export default function LanguageSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: LanguageOption[];
  onChange: (code: string) => void;
}) {
  const t = useTranslations("Header");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => options.find((o) => o.code === value) ?? options[0],
    [options, value],
  );

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = wrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <MenuWrap ref={wrapRef}>
      <Trigger
        type="button"
        aria-label={t("language.ariaLabel")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        $isOpen={open}
      >
        <Flag aria-hidden>{selected?.flag}</Flag>
        <TriggerLabel>{selected?.label}</TriggerLabel>
        <Chevron aria-hidden />
      </Trigger>

      {open && (
        <Menu role="menu" aria-label={t("language.optionsAriaLabel")}>
          {options.map((opt) => (
            <Item
              key={opt.code}
              role="menuitem"
              type="button"
              onClick={() => {
                onChange(opt.code);
                setOpen(false);
              }}
              selected={selected.code === opt.code}
            >
              <Flag aria-hidden>{opt.flag}</Flag>
              <ItemLabel>{opt.label}</ItemLabel>
            </Item>
          ))}
        </Menu>
      )}
    </MenuWrap>
  );
}
