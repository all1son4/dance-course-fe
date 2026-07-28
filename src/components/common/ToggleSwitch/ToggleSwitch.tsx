"use client";

import { Input, Root, Track } from "./ToggleSwitch.styles";

type ToggleSwitchProps = {
  ariaLabel: string;
  checked: boolean;
  className?: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

export default function ToggleSwitch({
  ariaLabel,
  checked,
  className,
  disabled = false,
  onChange,
}: ToggleSwitchProps) {
  return (
    <Root className={className}>
      <Input
        type="checkbox"
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <Track aria-hidden />
    </Root>
  );
}
