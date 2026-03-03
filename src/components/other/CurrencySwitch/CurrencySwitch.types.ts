export type CurrencySwitchValue = "pln" | "eur";

export type CurrencySwitchProps = {
  disabled?: boolean;
  onChange?: (value: CurrencySwitchValue) => void;
  value: CurrencySwitchValue;
  width?: string;
};
