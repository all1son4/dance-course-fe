export const getSafeErrorCategory = (error: unknown) => {
  if (error instanceof SyntaxError) return "SyntaxError";
  if (error instanceof TypeError) return "TypeError";
  if (error instanceof RangeError) return "RangeError";
  if (error instanceof Error) return "Error";
  return "Unknown";
};

/** Never log an exception directly: provider and database messages may contain PII. */
export const logSafeError = (context: string, error: unknown) => {
  console.error(context, { errorCategory: getSafeErrorCategory(error) });
};
