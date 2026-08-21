// Compact money rendering for the admin UI: whole amounts drop the decimals
// ("349 PLN"), fractional ones keep two ("349.50 PLN"). The monthly CSV report
// deliberately keeps its own always-two-decimals accounting format.
export const formatMinorAmount = (amountMinor: number, currency: string) => {
  const major = amountMinor / 100;
  const formattedMajor = Number.isInteger(major) ? String(major) : major.toFixed(2);

  return `${formattedMajor} ${currency.toUpperCase()}`;
};

export const formatMinorDelta = (deltaMinor: number, currency: string) =>
  `${deltaMinor > 0 ? "+" : "−"}${formatMinorAmount(Math.abs(deltaMinor), currency)}`;
