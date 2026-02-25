import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ru", "en", "pl"],
  defaultLocale: "ru",
  localePrefix: "never",
});
