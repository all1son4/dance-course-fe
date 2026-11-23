const RULES = {
  pl: new Intl.PluralRules("pl"),
  ru: new Intl.PluralRules("ru"),
};

/**
 * The word form for a whole count by the language's own plural rules:
 * 1 неделя, 2 недели, 5 недель, 21 неделя; 1 tydzień, 2 tygodnie, 5 tygodni, 21 tygodni.
 */
export const pluralize = (
  locale: keyof typeof RULES,
  count: number,
  [one, few, many]: readonly [one: string, few: string, many: string],
) => {
  const category = RULES[locale].select(count);
  return category === "one" ? one : category === "few" ? few : many;
};

/** Russian shorthand for the admin's texts: plural(5, "письмо", "письма", "писем"). */
export const plural = (count: number, one: string, few: string, many: string) =>
  pluralize("ru", count, [one, few, many]);
