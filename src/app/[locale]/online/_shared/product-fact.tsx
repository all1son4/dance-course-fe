import type { ReactNode } from "react";

import { Date, DateBox, From } from "./section.styles";

type ProductFactProps = {
  label: ReactNode;
  value: ReactNode;
  /** Optional line under the value, e.g. a start-date note. */
  children?: ReactNode;
};

/** A labelled fact in a hero or a tariff card: "Start" / "Winter 2026", "Price" / "220 PLN". */
export default function ProductFact({ children, label, value }: ProductFactProps) {
  return (
    <DateBox>
      <From>{label}</From>
      <Date>{value}</Date>
      {children}
    </DateBox>
  );
}
