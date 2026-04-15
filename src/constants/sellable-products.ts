export type SupportedCheckoutCurrency = "pln" | "eur";

export type SellableProductCode =
  | "first-touch"
  | "choreo-still-alive"
  | "choreo-her-lies";

export type SellableProductOfferCode = "standard" | "without-mentor" | "with-mentor";

export type SellableProductPrices = Record<SupportedCheckoutCurrency, number>;

export type SellableProductOffer = {
  code: SellableProductOfferCode;
  id: string;
  label: string;
  labelKey: string;
  prices: SellableProductPrices;
  telegramAccessDurationDays: number;
};

export type SellableProduct = {
  accessNote: string;
  accessNoteKey: string;
  code: SellableProductCode;
  description: string[];
  descriptionKeys: string[];
  id: string;
  slug: string;
  title: string;
  titleKey: string;
  type: "course" | "choreo";
  offers: SellableProductOffer[];
  defaultOfferId: string;
};

type CheckoutHrefOptions = {
  offerId?: string;
  productId: string;
};

export const SELLABLE_PRODUCTS: Record<SellableProductCode, SellableProduct> = {
  "first-touch": {
    accessNote:
      "Продолжительность курса - 1,5 месяца, доступ к урокам - 4 месяца через приватный Telegram-чат.",
    accessNoteKey: "firstTouch.accessNote",
    code: "first-touch",
    description: [
      "Курс для тех, кто никогда не танцевал, но хочет научиться чувствовать тело, уверенность и движение.",
      "Мы будем работать над базовой техникой, стопами, эмоциями и в конце выучим вашу первую хореографию.",
    ],
    descriptionKeys: ["firstTouch.description.1", "firstTouch.description.2"],
    id: "prd_7VnL4kX2mQ8s",
    slug: "first-touch",
    title: 'Курс для начинающих "First Touch"',
    titleKey: "firstTouch.title",
    type: "course",
    defaultOfferId: "off_4BcM9pR6tH1x",
    offers: [
      {
        code: "standard",
        id: "off_4BcM9pR6tH1x",
        label: "Стандартный доступ",
        labelKey: "firstTouch.offers.standard",
        prices: {
          pln: 250,
          eur: 50,
        },
        telegramAccessDurationDays: 0,
      },
    ],
  },
  "choreo-still-alive": {
    accessNote: "Доступ к материалам 2 месяца через приватный Telegram-канал.",
    accessNoteKey: "choreoStillAlive.accessNote",
    code: "choreo-still-alive",
    description: [
      "Онлайн-разбор хореографии Still Alive для тех, кто хочет глубины, структуры и выразительного танца.",
      "Урок доступен в удобном онлайн-формате: можно пересматривать и повторять материал столько раз, сколько нужно, чтобы уверенно собрать все в музыку.",
      "Доступен формат самостоятельного прохождения или участие с куратором и обратной связью.",
    ],
    descriptionKeys: [
      "choreoStillAlive.description.1",
      "choreoStillAlive.description.2",
      "choreoStillAlive.description.3",
    ],
    id: "prd_2QfH8nW5cK3y",
    slug: "still-alive",
    title: 'Видео-разбор хореографии "Still Alive"',
    titleKey: "choreoStillAlive.title",
    type: "choreo",
    defaultOfferId: "off_5DxR2mL8qJ4v",
    offers: [
      {
        code: "without-mentor",
        id: "off_5DxR2mL8qJ4v",
        label: "Без куратора",
        labelKey: "choreoStillAlive.offers.withoutMentor",
        prices: {
          pln: 60,
          eur: 15,
        },
        telegramAccessDurationDays: 60,
      },
      {
        code: "with-mentor",
        id: "off_8KtP6zN3bS7c",
        label: "С куратором",
        labelKey: "choreoStillAlive.offers.withMentor",
        prices: {
          pln: 100,
          eur: 25,
        },
        telegramAccessDurationDays: 60,
      },
    ],
  },
  "choreo-her-lies": {
    accessNote: "Доступ к материалам 2 месяца через приватный Telegram-канал.",
    accessNoteKey: "choreoHerLies.accessNote",
    code: "choreo-her-lies",
    description: [
      "Онлайн-разбор хореографии Her Lies для тех, кто хочет глубины, структуры и выразительного танца.",
      "Урок доступен в удобном онлайн-формате: можно пересматривать и повторять материал столько раз, сколько нужно, чтобы уверенно собрать все в музыку.",
      "Доступен формат самостоятельного прохождения или участие с куратором и обратной связью.",
    ],
    descriptionKeys: [
      "choreoHerLies.description.1",
      "choreoHerLies.description.2",
      "choreoHerLies.description.3",
    ],
    id: "prd_9MwT3aF7rD6n",
    slug: "her-lies",
    title: 'Видео-разбор хореографии "Her Lies"',
    titleKey: "choreoHerLies.title",
    type: "choreo",
    defaultOfferId: "off_3HbC8xP2mV6q",
    offers: [
      {
        code: "without-mentor",
        id: "off_3HbC8xP2mV6q",
        label: "Без куратора",
        labelKey: "choreoHerLies.offers.withoutMentor",
        prices: {
          pln: 60,
          eur: 15,
        },
        telegramAccessDurationDays: 60,
      },
      {
        code: "with-mentor",
        id: "off_6ZrN1kL5wT8d",
        label: "С куратором",
        labelKey: "choreoHerLies.offers.withMentor",
        prices: {
          pln: 100,
          eur: 25,
        },
        telegramAccessDurationDays: 60,
      },
    ],
  },
};

export const SELLABLE_PRODUCTS_LIST = Object.values(SELLABLE_PRODUCTS);
export const DEFAULT_CHECKOUT_PRODUCT = SELLABLE_PRODUCTS["first-touch"];
export const DEFAULT_CHECKOUT_CURRENCY: SupportedCheckoutCurrency = "pln";

export const getDefaultCheckoutCurrencyByLocale = (
  locale: string | null | undefined,
): SupportedCheckoutCurrency => (locale?.toLowerCase().startsWith("en") ? "eur" : "pln");

export const getSellableProductById = (productId: string | null | undefined) =>
  SELLABLE_PRODUCTS_LIST.find((product) => product.id === productId);

export const getDefaultProductOffer = (product: SellableProduct) =>
  product.offers.find((offer) => offer.id === product.defaultOfferId) ??
  product.offers[0];

export const getSellableProductOfferById = (
  product: SellableProduct,
  offerId: string | null | undefined,
) => product.offers.find((offer) => offer.id === offerId);

export const getResolvedCheckoutCurrency = (
  currency: string | null | undefined,
): SupportedCheckoutCurrency => (currency === "eur" ? "eur" : DEFAULT_CHECKOUT_CURRENCY);

export const getProductPrice = (
  product: SellableProduct,
  offerId: string | null | undefined,
  currency: SupportedCheckoutCurrency = DEFAULT_CHECKOUT_CURRENCY,
) => {
  const offer =
    getSellableProductOfferById(product, offerId) ?? getDefaultProductOffer(product);

  return offer.prices[currency];
};

export const formatCheckoutPrice = (
  amount: number,
  currency: SupportedCheckoutCurrency,
) => `${amount} ${currency.toUpperCase()}`;

export const buildCheckoutHref = ({ offerId, productId }: CheckoutHrefOptions) => {
  const searchParams = new URLSearchParams({
    product: productId,
  });

  if (offerId) {
    searchParams.set("offer", offerId);
  }

  return `/payment?${searchParams.toString()}`;
};
