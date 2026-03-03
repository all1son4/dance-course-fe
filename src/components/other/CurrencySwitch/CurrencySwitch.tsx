import { useTranslations } from "next-intl";

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

  return (
    <Root $value={value} $width={width} aria-label={t("ariaLabel")} role="radiogroup">
      {OPTIONS.map((option) => {
        const isActive = option === value;

        return (
          <OptionButton
            key={option}
            $isActive={isActive}
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => onChange?.(option)}
            role="radio"
            type="button"
          >
            <p>{option.toUpperCase()}</p>
          </OptionButton>
        );
      })}
    </Root>
  );
}
