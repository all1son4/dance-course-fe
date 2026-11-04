/**
 * Mail providers our buyers actually use. A typo in the domain is the one
 * email mistake that silently loses the access link, so the checkout offers
 * the corrected address instead of letting it through.
 */
const KNOWN_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "icloud.com",
  "me.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "proton.me",
  "protonmail.com",
  "mail.ru",
  "yandex.ru",
  "ya.ru",
  "bk.ru",
  "inbox.ru",
  "list.ru",
  "rambler.ru",
  "wp.pl",
  "o2.pl",
  "onet.pl",
  "interia.pl",
  "gazeta.pl",
  "op.pl",
  "ukr.net",
  "tut.by",
] as const;

/** Optimal string alignment distance: a swap of two neighbours counts as one edit. */
const getEditDistance = (left: string, right: string) => {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const distances: number[][] = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) =>
      row === 0 ? column : column === 0 ? row : 0,
    ),
  );

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;

      distances[row][column] = Math.min(
        distances[row - 1][column] + 1,
        distances[row][column - 1] + 1,
        distances[row - 1][column - 1] + cost,
      );

      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        distances[row][column] = Math.min(
          distances[row][column],
          distances[row - 2][column - 2] + 1,
        );
      }
    }
  }

  return distances[rows - 1][columns - 1];
};

/**
 * The address with its domain corrected when the domain is one or two edits
 * away from a known provider ("gmial.com", "gmail.con"), otherwise null.
 * Short domains only tolerate one edit, so "o2.pl" never turns into "op.pl".
 */
export const getEmailSuggestion = (email: string): string | null => {
  const trimmedEmail = email.trim();
  const atIndex = trimmedEmail.lastIndexOf("@");

  if (atIndex < 1 || atIndex === trimmedEmail.length - 1) {
    return null;
  }

  const localPart = trimmedEmail.slice(0, atIndex);
  const domain = trimmedEmail.slice(atIndex + 1).toLowerCase();

  if (
    !domain.includes(".") ||
    (KNOWN_EMAIL_DOMAINS as readonly string[]).includes(domain)
  ) {
    return null;
  }

  let bestDomain: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const knownDomain of KNOWN_EMAIL_DOMAINS) {
    const allowedDistance = knownDomain.length <= 6 ? 1 : 2;
    const distance = getEditDistance(domain, knownDomain);

    if (distance <= allowedDistance && distance < bestDistance) {
      bestDomain = knownDomain;
      bestDistance = distance;
    }
  }

  return bestDomain ? `${localPart}@${bestDomain}` : null;
};
