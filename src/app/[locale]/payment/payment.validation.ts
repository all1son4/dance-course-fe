import * as yup from "yup";

import { isSupportedCountryCode } from "@/constants/countries";

import type { PaymentCustomerData } from "./payment.constants";

export type PaymentValidationLocale = "ru" | "en" | "pl";

type PaymentValidationMessages = {
  addressMax: string;
  addressRequired: string;
  cityMax: string;
  cityRequired: string;
  countryRequired: string;
  countryInvalid: string;
  emailInvalid: string;
  emailRequired: string;
  fullNameMax: string;
  fullNameMin: string;
  fullNameRequired: string;
  lessonLanguageInvalid: string;
  lessonLanguageRequired: string;
  nicknameInvalid: string;
  nicknameRequired: string;
  postalCodeMax: string;
  postalCodeRequired: string;
};

const PAYMENT_VALIDATION_MESSAGES: Record<
  PaymentValidationLocale,
  PaymentValidationMessages
> = {
  ru: {
    addressMax: "Адрес должен содержать не больше 160 символов",
    addressRequired: "Введи адрес",
    cityMax: "Название города должно содержать не больше 80 символов",
    cityRequired: "Введи город",
    countryRequired: "Выбери страну",
    countryInvalid: "Выбери страну из списка",
    emailInvalid: "Введи корректный email",
    emailRequired: "Введи email",
    fullNameMax: "Имя и фамилия: не больше 100 символов",
    fullNameMin: "Введи имя и фамилию полностью",
    fullNameRequired: "Введи имя и фамилию",
    lessonLanguageInvalid: "Выбери язык из списка",
    lessonLanguageRequired: "Выбери язык материалов",
    nicknameInvalid: "Введи корректный ник в Telegram в формате @username",
    nicknameRequired: "Введи ник в Telegram",
    postalCodeMax: "Почтовый индекс должен содержать не больше 24 символов",
    postalCodeRequired: "Введи почтовый индекс",
  },
  en: {
    addressMax: "Address must be 160 characters or fewer",
    addressRequired: "Enter your address",
    cityMax: "City must be 80 characters or fewer",
    cityRequired: "Enter your city",
    countryRequired: "Select your country",
    countryInvalid: "Select a country from the list",
    emailInvalid: "Enter a valid email address",
    emailRequired: "Enter your email",
    fullNameMax: "Full name must be 100 characters or fewer",
    fullNameMin: "Enter your full name",
    fullNameRequired: "Enter your full name",
    lessonLanguageInvalid: "Select a language from the list",
    lessonLanguageRequired: "Select the material language",
    nicknameInvalid: "Enter a valid Telegram username in the @username format",
    nicknameRequired: "Enter your Telegram username",
    postalCodeMax: "Postal code must be 24 characters or fewer",
    postalCodeRequired: "Enter your postal code",
  },
  pl: {
    addressMax: "Adres może mieć maksymalnie 160 znaków",
    addressRequired: "Wpisz adres",
    cityMax: "Nazwa miasta może mieć maksymalnie 80 znaków",
    cityRequired: "Wpisz miasto",
    countryRequired: "Wybierz kraj",
    countryInvalid: "Wybierz kraj z listy",
    emailInvalid: "Wpisz poprawny adres e-mail",
    emailRequired: "Wpisz adres e-mail",
    fullNameMax: "Imię i nazwisko mogą mieć maksymalnie 100 znaków",
    fullNameMin: "Wpisz pełne imię i nazwisko",
    fullNameRequired: "Wpisz imię i nazwisko",
    lessonLanguageInvalid: "Wybierz język z listy",
    lessonLanguageRequired: "Wybierz język materiałów",
    nicknameInvalid: "Wpisz poprawny nick w Telegramie w formacie @username",
    nicknameRequired: "Wpisz nick w Telegramie",
    postalCodeMax: "Kod pocztowy może mieć maksymalnie 24 znaki",
    postalCodeRequired: "Wpisz kod pocztowy",
  },
};

const PAYMENT_CUSTOMER_SCHEMA_VERSION = "invoice-address-fields-v1";
const schemaCache = new Map<string, yup.ObjectSchema<PaymentCustomerData>>();

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
  const cacheKey = `${PAYMENT_CUSTOMER_SCHEMA_VERSION}:${resolvedLocale}`;
  const cachedSchema = schemaCache.get(cacheKey);

  if (cachedSchema) {
    return cachedSchema;
  }

  const messages = PAYMENT_VALIDATION_MESSAGES[resolvedLocale];
  const schema: yup.ObjectSchema<PaymentCustomerData> = yup.object({
    fullName: trimmedRequiredText(messages.fullNameRequired)
      .min(3, messages.fullNameMin)
      .max(100, messages.fullNameMax),
    email: yup
      .string()
      .transform((value) => (typeof value === "string" ? value.trim() : ""))
      .email(messages.emailInvalid)
      .required(messages.emailRequired),
    nickname: yup
      .string()
      .matches(/^@[A-Za-z0-9_]{1,32}$/, messages.nicknameInvalid)
      .required(messages.nicknameRequired),
    address: trimmedRequiredText(messages.addressRequired).max(160, messages.addressMax),
    city: trimmedRequiredText(messages.cityRequired).max(80, messages.cityMax),
    postalCode: trimmedRequiredText(messages.postalCodeRequired).max(
      24,
      messages.postalCodeMax,
    ),
    country: yup
      .string()
      .transform((value) => (typeof value === "string" ? value.trim().toUpperCase() : ""))
      .required(messages.countryRequired)
      .test(
        "country-code",
        messages.countryInvalid,
        (value) => typeof value === "string" && isSupportedCountryCode(value),
      ),
    lessonLanguage: yup
      .string()
      .transform((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
      .required(messages.lessonLanguageRequired)
      .oneOf(["ru", "en"], messages.lessonLanguageInvalid),
  });

  schemaCache.set(cacheKey, schema);

  return schema;
};
