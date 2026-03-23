"use client";

import { useTranslations } from "next-intl";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  disabled = false,
}: {
  value: string;
  options: LanguageOption[];
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Header");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selected = useMemo(
    () => options.find((o) => o.code === value) ?? options[0],
    [options, value],
  );
  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.code === selected?.code),
    [options, selected?.code],
  );

  const optionsCount = options.length;

  const focusOptionByIndex = useCallback(
    (index: number) => {
      if (optionsCount === 0) {
        return;
      }

      const normalizedIndex = ((index % optionsCount) + optionsCount) % optionsCount;
      optionRefs.current[normalizedIndex]?.focus();
    },
    [optionsCount],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    function onDocClick(e: MouseEvent) {
      const el = wrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || optionsCount === 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      focusOptionByIndex(selectedIndex >= 0 ? selectedIndex : 0);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [focusOptionByIndex, open, optionsCount, selectedIndex]);

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled || optionsCount === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      window.requestAnimationFrame(() => {
        focusOptionByIndex(selectedIndex >= 0 ? selectedIndex : 0);
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      window.requestAnimationFrame(() => {
        focusOptionByIndex(selectedIndex >= 0 ? selectedIndex : optionsCount - 1);
      });
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && !open) {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleItemKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
    code: string,
  ) => {
    if (disabled) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOptionByIndex(index + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOptionByIndex(index - 1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      focusOptionByIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      focusOptionByIndex(optionsCount - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onChange(code);
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <MenuWrap ref={wrapRef}>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-label={t("language.ariaLabel")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={disabled}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
        $isOpen={open}
      >
        <Flag aria-hidden>{selected?.flag}</Flag>
        <TriggerLabel>{selected?.label}</TriggerLabel>
        <Chevron aria-hidden />
      </Trigger>

      {open && (
        <Menu role="menu" aria-label={t("language.optionsAriaLabel")}>
          {options.map((opt, index) => (
            <Item
              key={opt.code}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              role="menuitemradio"
              aria-checked={selected.code === opt.code}
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(opt.code);
                setOpen(false);
              }}
              onKeyDown={(event) => handleItemKeyDown(event, index, opt.code)}
              $selected={selected.code === opt.code}
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
