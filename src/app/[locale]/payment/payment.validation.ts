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
    addressRequired: "Введите адрес",
    cityMax: "Город должен содержать не больше 80 символов",
    cityRequired: "Введите город",
    countryRequired: "Выберите страну",
    countryInvalid: "Выберите страну из списка",
    emailInvalid: "Введите корректный email",
    emailRequired: "Введите email",
    fullNameMax: "ФИО должно содержать не больше 100 символов",
    fullNameMin: "Введите ФИО полностью",
    fullNameRequired: "Введите ФИО",
    lessonLanguageInvalid: "Выберите язык из списка",
    lessonLanguageRequired: "Выберите язык материалов",
    nicknameInvalid: "Введите корректный ник Telegram в формате @username",
    nicknameRequired: "Введите ник в Telegram",
    postalCodeMax: "Почтовый код должен содержать не больше 24 символов",
    postalCodeRequired: "Введите почтовый код",
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
    lessonLanguageRequired: "Select material language",
    nicknameInvalid: "Enter a valid Telegram username in the @username format",
    nicknameRequired: "Enter your Telegram username",
    postalCodeMax: "Postal code must be 24 characters or fewer",
    postalCodeRequired: "Enter your postal code",
  },
  pl: {
    addressMax: "Adres moze miec maksymalnie 160 znakow",
    addressRequired: "Wpisz adres",
    cityMax: "Miasto moze miec maksymalnie 80 znakow",
    cityRequired: "Wpisz miasto",
    countryRequired: "Wybierz kraj",
    countryInvalid: "Wybierz kraj z listy",
    emailInvalid: "Wpisz poprawny adres e-mail",
    emailRequired: "Wpisz adres e-mail",
    fullNameMax: "Imie i nazwisko moga miec maksymalnie 100 znakow",
    fullNameMin: "Wpisz pelne imie i nazwisko",
    fullNameRequired: "Wpisz imie i nazwisko",
    lessonLanguageInvalid: "Wybierz jezyk z listy",
    lessonLanguageRequired: "Wybierz język materiałów",
    nicknameInvalid: "Wpisz poprawny nick Telegram w formacie @username",
    nicknameRequired: "Wpisz nick Telegram",
    postalCodeMax: "Kod pocztowy moze miec maksymalnie 24 znaki",
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
