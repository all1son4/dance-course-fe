import type { Replacement } from "@react-input/mask";

import type { InputMaskPattern } from "./Input.types";

type ResolvedMaskOptions = {
  mask?: string;
  replacement?: Replacement;
};

const LEGACY_STRING_REPLACEMENTS: Record<string, RegExp> = {
  "9": /\d/,
  a: /[A-Za-z]/,
  "*": /[A-Za-z0-9]/,
};

const PLACEHOLDER_CHAR_CODE_START = 0xe000;

const getPlaceholder = (index: number) =>
  String.fromCharCode(PLACEHOLDER_CHAR_CODE_START + index);

const hasReplacements = (replacement: Replacement) => Object.keys(replacement).length > 0;

const resolveStringMask = (inputMask: string): ResolvedMaskOptions => {
  const replacement: Replacement = {};
  let mask = "";
  let replacementIndex = 0;
  let isEscaped = false;

  for (const char of inputMask) {
    if (!isEscaped && char === "\\") {
      isEscaped = true;
      continue;
    }

    const legacyReplacement = !isEscaped ? LEGACY_STRING_REPLACEMENTS[char] : undefined;

    if (legacyReplacement) {
      const placeholder = getPlaceholder(replacementIndex);
      replacement[placeholder] = legacyReplacement;
      mask += placeholder;
      replacementIndex += 1;
    } else {
      mask += char;
    }

    isEscaped = false;
  }

  if (isEscaped) {
    mask += "\\";
  }

  return hasReplacements(replacement) ? { mask, replacement } : { mask };
};

const resolveArrayMask = (inputMask: Array<string | RegExp>): ResolvedMaskOptions => {
  const replacement: Replacement = {};

  const mask = inputMask
    .map((part, index) => {
      if (part instanceof RegExp) {
        const placeholder = getPlaceholder(index);
        replacement[placeholder] = part;

        return placeholder;
      }

      return part;
    })
    .join("");

  return hasReplacements(replacement) ? { mask, replacement } : { mask };
};

export const resolveMaskOptions = (
  inputMask: InputMaskPattern | null | undefined,
): ResolvedMaskOptions => {
  if (!inputMask) {
    return {};
  }

  if (typeof inputMask === "string") {
    return resolveStringMask(inputMask);
  }

  return resolveArrayMask(inputMask);
};
