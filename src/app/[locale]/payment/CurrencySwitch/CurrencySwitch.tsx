"use client";

import { useTranslations } from "next-intl";
import { type KeyboardEvent as ReactKeyboardEvent, useRef } from "react";

import { OptionButton, Root } from "./CurrencySwitch.styles";
import type { CurrencySwitchProps, CurrencySwitchValue } from "./CurrencySwitch.types";

const OPTIONS: CurrencySwitchValue[] = ["pln", "eur"];

export default function CurrencySwitch({
  disabled = false,
  onChange,
  value,
  width = "160px",
}: CurrencySwitchProps) {
  const t = useTranslations("CurrencySwitch");
  const optionRefs = useRef<Record<CurrencySwitchValue, HTMLButtonElement | null>>({
    eur: null,
    pln: null,
  });

  const handleOptionKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    option: CurrencySwitchValue,
  ) => {
    const index = OPTIONS.indexOf(option);

    if (index === -1) {
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const nextOption = OPTIONS[(index + 1) % OPTIONS.length];
      onChange?.(nextOption);
      optionRefs.current[nextOption]?.focus();
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const nextOption = OPTIONS[(index - 1 + OPTIONS.length) % OPTIONS.length];
      onChange?.(nextOption);
      optionRefs.current[nextOption]?.focus();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      onChange?.(OPTIONS[0]);
      optionRefs.current[OPTIONS[0]]?.focus();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      onChange?.(OPTIONS[OPTIONS.length - 1]);
      optionRefs.current[OPTIONS[OPTIONS.length - 1]]?.focus();
    }
  };

  return (
    <Root $value={value} $width={width} aria-label={t("ariaLabel")} role="radiogroup">
      {OPTIONS.map((option) => {
        const isActive = option === value;

        return (
          <OptionButton
            key={option}
            ref={(node) => {
              optionRefs.current[option] = node;
            }}
            $isActive={isActive}
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => onChange?.(option)}
            onKeyDown={(event) => handleOptionKeyDown(event, option)}
            role="radio"
            tabIndex={isActive ? 0 : -1}
            type="button"
          >
            <p>{option.toUpperCase()}</p>
          </OptionButton>
        );
      })}
    </Root>
  );
}
