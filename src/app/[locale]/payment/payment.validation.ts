import * as yup from "yup";

import { isSupportedCountryCode } from "@/constants/countries";

import type { PaymentCustomerData } from "./payment.constants";

export type PaymentValidationLocale = "ru" | "en" | "pl";

type PaymentValidationMessages = {
  countryRequired: string;
  countryInvalid: string;
  emailInvalid: string;
  emailRequired: string;
  lastNameMax: string;
  lastNameMin: string;
  lastNameRequired: string;
  nameMax: string;
  nameMin: string;
  nameRequired: string;
  nicknameInvalid: string;
  nicknameRequired: string;
};

const PAYMENT_VALIDATION_MESSAGES: Record<
  PaymentValidationLocale,
  PaymentValidationMessages
> = {
  ru: {
    countryRequired: "Выберите страну",
    countryInvalid: "Выберите страну из списка",
    emailInvalid: "Введите корректный email",
    emailRequired: "Введите email",
    lastNameMax: "Фамилия должна содержать не больше 50 символов",
    lastNameMin: "Фамилия должна содержать минимум 2 символа",
    lastNameRequired: "Введите фамилию",
    nameMax: "Имя должно содержать не больше 50 символов",
    nameMin: "Имя должно содержать минимум 2 символа",
    nameRequired: "Введите имя",
    nicknameInvalid: "Введите корректный ник Telegram в формате @username",
    nicknameRequired: "Введите ник в Telegram",
  },
  en: {
    countryRequired: "Select your country",
    countryInvalid: "Select a country from the list",
    emailInvalid: "Enter a valid email address",
    emailRequired: "Enter your email",
    lastNameMax: "Last name must be 50 characters or fewer",
    lastNameMin: "Last name must be at least 2 characters",
    lastNameRequired: "Enter your last name",
    nameMax: "Name must be 50 characters or fewer",
    nameMin: "Name must be at least 2 characters",
    nameRequired: "Enter your name",
    nicknameInvalid: "Enter a valid Telegram username in the @username format",
    nicknameRequired: "Enter your Telegram username",
  },
  pl: {
    countryRequired: "Wybierz kraj",
    countryInvalid: "Wybierz kraj z listy",
    emailInvalid: "Wpisz poprawny adres e-mail",
    emailRequired: "Wpisz adres e-mail",
    lastNameMax: "Nazwisko moze miec maksymalnie 50 znakow",
    lastNameMin: "Nazwisko musi miec co najmniej 2 znaki",
    lastNameRequired: "Wpisz nazwisko",
    nameMax: "Imie moze miec maksymalnie 50 znakow",
    nameMin: "Imie musi miec co najmniej 2 znaki",
    nameRequired: "Wpisz imie",
    nicknameInvalid: "Wpisz poprawny nick Telegram w formacie @username",
    nicknameRequired: "Wpisz nick Telegram",
  },
};

const schemaCache = new Map<
  PaymentValidationLocale,
  yup.ObjectSchema<PaymentCustomerData>
>();

const trimmedRequiredText = (message: string) =>
  yup
    .string()
    .transform((value) => (typeof value === "string" ? value.trim() : ""))
    .required(message);

export const resolvePaymentValidationLocale = (
  locale: string | null | undefined,
): PaymentValidationLocale => {
  const normalizedLocale = locale?.toLowerCase() ?? "";

  if (normalizedLocale.startsWith("en")) {
    return "en";
  }

  if (normalizedLocale.startsWith("pl")) {
    return "pl";
  }

  return "ru";
};

export const getPaymentCustomerSchema = (
  locale: string | null | undefined,
): yup.ObjectSchema<PaymentCustomerData> => {
  const resolvedLocale = resolvePaymentValidationLocale(locale);
  const cachedSchema = schemaCache.get(resolvedLocale);

  if (cachedSchema) {
    return cachedSchema;
  }

  const messages = PAYMENT_VALIDATION_MESSAGES[resolvedLocale];
  const schema: yup.ObjectSchema<PaymentCustomerData> = yup.object({
    name: trimmedRequiredText(messages.nameRequired)
      .min(2, messages.nameMin)
      .max(50, messages.nameMax),
    lastName: trimmedRequiredText(messages.lastNameRequired)
      .min(2, messages.lastNameMin)
      .max(50, messages.lastNameMax),
    email: yup
      .string()
      .transform((value) => (typeof value === "string" ? value.trim() : ""))
      .email(messages.emailInvalid)
      .required(messages.emailRequired),
    nickname: yup
      .string()
      .matches(/^@[A-Za-z0-9_]{1,32}$/, messages.nicknameInvalid)
      .required(messages.nicknameRequired),
    country: yup
      .string()
      .transform((value) => (typeof value === "string" ? value.trim().toUpperCase() : ""))
      .required(messages.countryRequired)
      .test(
        "country-code",
        messages.countryInvalid,
        (value) => typeof value === "string" && isSupportedCountryCode(value),
      ),
  });

  schemaCache.set(resolvedLocale, schema);

  return schema;
};
