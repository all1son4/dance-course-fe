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
  TriggerLabelGhost,
  TriggerLabelText,
} from "./LanguageSelect.styles";

/** Failsafe for a swallowed animationend (tab in the background, etc.). */
const MENU_EXIT_FALLBACK_MS = 600;
import type { LanguageOption } from "./LanguageSelect.types";

const getSelectedLanguageOption = (options: LanguageOption[], value: string) =>
  options.find((option) => option.code === value) ?? options[0];

const getSelectedLanguageOptionIndex = (
  options: LanguageOption[],
  selectedCode: string | undefined,
) => options.findIndex((option) => option.code === selectedCode);

const getWrappedLanguageOptionIndex = (index: number, optionsCount: number) =>
  ((index % optionsCount) + optionsCount) % optionsCount;

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
  // The menu stays mounted through its exit animation; conditional rendering
  // made it vanish in one frame after a 320ms entrance.
  const [isMenuMounted, setIsMenuMounted] = useState(false);
  if (open && !isMenuMounted) {
    setIsMenuMounted(true);
  }
  const isMenuLeaving = isMenuMounted && !open;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selected = useMemo(
    () => getSelectedLanguageOption(options, value),
    [options, value],
  );
  const selectedIndex = useMemo(
    () => getSelectedLanguageOptionIndex(options, selected?.code),
    [options, selected?.code],
  );

  const optionsCount = options.length;

  const focusOptionByIndex = useCallback(
    (index: number) => {
      if (optionsCount === 0) {
        return;
      }

      // Keyboard navigation wraps at both ends of the menu.
      const normalizedIndex = getWrappedLanguageOptionIndex(index, optionsCount);
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
    if (!isMenuLeaving) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => setIsMenuMounted(false),
      MENU_EXIT_FALLBACK_MS,
    );

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isMenuLeaving]);

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

  const openMenuAndFocusOption = (index: number) => {
    setOpen(true);
    window.requestAnimationFrame(() => {
      focusOptionByIndex(index);
    });
  };

  const closeMenuAndRestoreTriggerFocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled || optionsCount === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenuAndFocusOption(selectedIndex >= 0 ? selectedIndex : 0);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenuAndFocusOption(selectedIndex >= 0 ? selectedIndex : optionsCount - 1);
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
      closeMenuAndRestoreTriggerFocus();
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
      closeMenuAndRestoreTriggerFocus();
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
        {/* Every label is laid out invisibly in the same cell, so the trigger
            keeps the width of the longest one and the nav never shifts when
            the language changes ("Русский" is 18px wider than "Polski"). */}
        <TriggerLabel>
          {options.map((option) => (
            <TriggerLabelGhost key={option.code} aria-hidden>
              {option.label}
            </TriggerLabelGhost>
          ))}
          <TriggerLabelText>{selected?.label}</TriggerLabelText>
        </TriggerLabel>
        <Chevron aria-hidden />
      </Trigger>

      {isMenuMounted && (
        <Menu
          role="menu"
          aria-label={t("language.optionsAriaLabel")}
          data-state={open ? "open" : "closed"}
          inert={open ? undefined : true}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && !open) {
              setIsMenuMounted(false);
            }
          }}
        >
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
