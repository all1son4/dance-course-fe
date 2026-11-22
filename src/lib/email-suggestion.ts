/** The address shape every email field checks: name@domain.tld, no spaces. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

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
 * Providers that are real on their own although one letter away from a known
 * one: "mail.com" and "ymail.com" are not misspelt "gmail.com".
 */
const REAL_LOOKALIKE_NAMES = new Set(["mail", "ymail", "email"]);

const GENERIC_TLDS = new Set(["com", "net", "org", "info", "biz", "edu", "gov"]);
const COUNTRY_TLDS_OUTSIDE_REGIONS = new Set(["uk", "eu", "su"]);
const regionNames = new Intl.DisplayNames(["en"], { fallback: "none", type: "region" });

/**
 * Whether the ending exists, so "yandex.by", "mail.ua" or "inbox.lv" are someone's
 * real address and not a typo of ".ru"; ".con", ".cmo" or ".ry" exist nowhere.
 */
const isRealTld = (tld: string) => {
  if (GENERIC_TLDS.has(tld) || COUNTRY_TLDS_OUTSIDE_REGIONS.has(tld)) return true;
  if (!/^[a-z]{2}$/u.test(tld) || tld === "zz") return false;

  return regionNames.of(tld.toUpperCase()) !== undefined;
};

/** Edits a provider name tolerates: none for two letters ("wp", "o2", "ya"). */
const getNameTolerance = (name: string) =>
  name.length <= 2 ? 0 : name.length <= 5 ? 1 : 2;

const splitDomain = (domain: string) => {
  const dotIndex = domain.lastIndexOf(".");

  return { name: domain.slice(0, dotIndex), tld: domain.slice(dotIndex + 1) };
};

const getNameDistance = (typed: string, known: string) => {
  if (typed === known) return 0;
  if (REAL_LOOKALIKE_NAMES.has(typed)) return null;

  const distance = getEditDistance(typed, known);
  return distance <= getNameTolerance(known) ? distance : null;
};

const getTldDistance = (typed: string, known: string, isTyping: boolean) => {
  if (typed === known) return 0;
  // ".co" on the way to ".com": a typo only once the person stopped typing.
  if (known.startsWith(typed)) return isTyping ? null : known.length - typed.length;
  if (isRealTld(typed)) return null;

  const distance = getEditDistance(typed, known);
  return distance <= (known.length <= 2 ? 1 : 2) ? distance : null;
};

/**
 * The address with its domain corrected when it is a misspelt known provider
 * ("gmial.com", "gmail.con", "yandex.ry"), otherwise null. The provider name and
 * the ending are checked apart, so another real address is never "corrected":
 * a different existing ending ("yandex.by") or a real provider of its own
 * ("mail.com") stays as typed. `isTyping` holds back endings the person may
 * still be finishing ("gmail.co").
 */
export const getEmailSuggestion = (
  email: string,
  { isTyping = false }: { isTyping?: boolean } = {},
): string | null => {
  const trimmedEmail = email.trim();
  const atIndex = trimmedEmail.lastIndexOf("@");

  if (atIndex < 1 || atIndex === trimmedEmail.length - 1) {
    return null;
  }

  const localPart = trimmedEmail.slice(0, atIndex);
  const domain = trimmedEmail.slice(atIndex + 1).toLowerCase();
  const typed = splitDomain(domain);

  if (
    !domain.includes(".") ||
    !typed.name ||
    !typed.tld ||
    (KNOWN_EMAIL_DOMAINS as readonly string[]).includes(domain)
  ) {
    return null;
  }

  let bestDomain: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const knownDomain of KNOWN_EMAIL_DOMAINS) {
    const known = splitDomain(knownDomain);
    const nameDistance = getNameDistance(typed.name, known.name);
    const tldDistance = getTldDistance(typed.tld, known.tld, isTyping);

    if (nameDistance === null || tldDistance === null) continue;

    const distance = nameDistance + tldDistance;
    if (distance < bestDistance) {
      bestDomain = knownDomain;
      bestDistance = distance;
    }
  }

  return bestDomain ? `${localPart}@${bestDomain}` : null;
};
