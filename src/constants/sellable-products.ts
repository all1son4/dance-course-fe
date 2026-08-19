export type SupportedCheckoutCurrency = "pln" | "eur";

export type SellableProductCode =
  | "first-touch"
  | "choreo-still-alive"
  | "choreo-her-lies"
  | "choreo-bundle"
  | "choreo-birthday-drop"
  | "online-group-anna-strok";

export type SellableProductOfferCode =
  | "standard"
  | "library-access"
  | "without-mentor"
  | "with-mentor"
  | "renewal-discount"
  | "renewal-library-access";

export type SellableProductPrices = Record<SupportedCheckoutCurrency, number>;

export type SellableProductOffer = {
  accessWorkflow?: string;
  code: SellableProductOfferCode;
  deliveryChannel?: string;
  id: string;
  label: string;
  labelKey: string;
  prices: SellableProductPrices;
  telegramAccessDurationDays: number;
};

export type SellableProduct = {
  accessNote: string;
  accessNoteKey: string;
  /** Short name for the checkout summary, when the full title is too long. */
  checkoutTitleKey?: string;
  code: SellableProductCode;
  description: string[];
  descriptionKeys: string[];
  id: string;
  /**
   * Whether money may be taken for this product. The database is authoritative;
   * the value here is the code-level default and never closes sales on its own.
   */
  salesEnabled: boolean;
  slug: string;
  title: string;
  titleKey: string;
  type: "course" | "choreo";
  offers: SellableProductOffer[];
  defaultOfferId: string;
};

const ONLINE_GROUP_STANDARD_OFFER_ID = "off_R6vN2cH9sW4y";
const ONLINE_GROUP_LIBRARY_OFFER_ID = "off_online_group_anna_strok_library_access";
export const ONLINE_GROUP_RENEWAL_OFFER_ID =
  "off_online_group_anna_strok_renewal_discount";
export const ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID =
  "off_online_group_anna_strok_renewal_library_access";

export const BIRTHDAY_DROP_PRODUCT_ID = "prd_choreo_birthday_drop";
export const BIRTHDAY_DROP_OFFER_ID = "off_choreo_birthday_drop_standard";

export const ONLINE_GROUP_NEW_OFFER_IDS = [
  ONLINE_GROUP_STANDARD_OFFER_ID,
  ONLINE_GROUP_LIBRARY_OFFER_ID,
] as const;

const ONLINE_GROUP_RENEWAL_OFFER_IDS = [
  ONLINE_GROUP_RENEWAL_OFFER_ID,
  ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
] as const;

export const isOnlineGroupLibraryOfferId = (offerId: string) =>
  offerId === ONLINE_GROUP_LIBRARY_OFFER_ID ||
  offerId === ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID;

export const isOnlineGroupNewOfferId = (offerId: string) =>
  (ONLINE_GROUP_NEW_OFFER_IDS as readonly string[]).includes(offerId);

export const isOnlineGroupRenewalOfferId = (offerId: string) =>
  (ONLINE_GROUP_RENEWAL_OFFER_IDS as readonly string[]).includes(offerId);

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
    salesEnabled: true,
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
        telegramAccessDurationDays: 120,
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
    salesEnabled: true,
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
    salesEnabled: true,
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
  "choreo-bundle": {
    accessNote:
      "Доступ к материалам 2 месяца через приватный Telegram-канал с двумя хореографиями.",
    accessNoteKey: "choreoBundle.accessNote",
    code: "choreo-bundle",
    description: [
      "Два онлайн-разбора хореографий в одном доступе для тех, кто хочет сразу работать с разной динамикой, подачей и музыкальностью.",
      "Внутри бандла — Still Alive и Her Lies: можно проходить материалы в удобном темпе, пересматривать уроки и собирать обе хореографии в музыку.",
      "Доступен формат самостоятельного прохождения или участие с куратором и обратной связью.",
    ],
    descriptionKeys: [
      "choreoBundle.description.1",
      "choreoBundle.description.2",
      "choreoBundle.description.3",
    ],
    id: "prd_choreo_bundle_duo",
    salesEnabled: true,
    slug: "still-alive-her-lies-bundle",
    title: 'Бандл разборов "Still Alive" + "Her Lies"',
    titleKey: "choreoBundle.title",
    type: "choreo",
    defaultOfferId: "off_choreo_bundle_duo_without_mentor",
    offers: [
      {
        code: "without-mentor",
        id: "off_choreo_bundle_duo_without_mentor",
        label: "Без куратора",
        labelKey: "choreoBundle.offers.withoutMentor",
        prices: {
          pln: 85,
          eur: 20,
        },
        telegramAccessDurationDays: 60,
      },
      {
        code: "with-mentor",
        id: "off_choreo_bundle_duo_with_mentor",
        label: "С куратором",
        labelKey: "choreoBundle.offers.withMentor",
        prices: {
          pln: 170,
          eur: 40,
        },
        telegramAccessDurationDays: 60,
      },
    ],
  },
  "choreo-birthday-drop": {
    accessNote: "Доступ к материалам навсегда, через приватный Telegram-канал.",
    accessNoteKey: "choreoBirthdayDrop.accessNote",
    checkoutTitleKey: "choreoBirthdayDrop.checkoutTitle",
    code: "choreo-birthday-drop",
    description: [
      "Онлайн-разбор хореографии Love me in the morning, собранный как отдельный Birthday Drop.",
      "Внутри — разбор связки, плейлист, мудборд и интервью «34 вопроса к моим 34».",
      "Доступ к материалам остаётся навсегда: можно возвращаться и повторять в любом темпе.",
    ],
    descriptionKeys: [
      "choreoBirthdayDrop.description.1",
      "choreoBirthdayDrop.description.2",
      "choreoBirthdayDrop.description.3",
    ],
    id: "prd_choreo_birthday_drop",
    salesEnabled: true,
    slug: "birthday-drop",
    title: 'Birthday Drop "Love me in the morning"',
    titleKey: "choreoBirthdayDrop.title",
    type: "choreo",
    defaultOfferId: "off_choreo_birthday_drop_standard",
    offers: [
      {
        /**
         * The `standard` code is what keeps this access perpetual: the timed
         * Telegram buckets are built from `with-mentor` / `without-mentor`
         * offers, so this one is never given an expiry and never revoked.
         */
        accessWorkflow: "telegram-channel-lifetime",
        code: "standard",
        deliveryChannel: "telegram",
        id: "off_choreo_birthday_drop_standard",
        label: "Стандартный доступ",
        labelKey: "choreoBirthdayDrop.offers.standard",
        prices: {
          pln: 85,
          eur: 20,
        },
        // Unused for this offer - access never expires - but the field is
        // required by the catalogue and the database check demands >= 0.
        telegramAccessDurationDays: 0,
      },
    ],
  },
  "online-group-anna-strok": {
    accessNote:
      "После оплаты мы отправим персональную одноразовую ссылку для входа в Telegram-группу.",
    accessNoteKey: "onlineGroupAnnaStrok.accessNote",
    code: "online-group-anna-strok",
    description: [
      "Формат регулярных тренировок для тех, кто хочет продолжать развиваться, поддерживать форму и работать с телом.",
      "Если у вас нет возможности посещать мои офлайн-занятия, вы сможете получать новые знания, практиковаться дома и быть на связи со мной, где бы вы ни находились.",
    ],
    descriptionKeys: [
      "onlineGroupAnnaStrok.description.1",
      "onlineGroupAnnaStrok.description.2",
    ],
    id: "prd_L9aK3mT7qP2x",
    salesEnabled: true,
    slug: "online-group-anna-strok",
    title: "Online Group by Anna Strok",
    titleKey: "onlineGroupAnnaStrok.title",
    type: "course",
    defaultOfferId: ONLINE_GROUP_STANDARD_OFFER_ID,
    offers: [
      {
        accessWorkflow: "telegram-online-group",
        code: "standard",
        deliveryChannel: "telegram",
        id: ONLINE_GROUP_STANDARD_OFFER_ID,
        label: "Standard",
        labelKey: "onlineGroupAnnaStrok.offers.standard",
        prices: {
          pln: 220,
          eur: 50,
        },
        telegramAccessDurationDays: 0,
      },
      {
        accessWorkflow: "telegram-online-group",
        code: "library-access",
        deliveryChannel: "telegram",
        id: ONLINE_GROUP_LIBRARY_OFFER_ID,
        label: "Plus",
        labelKey: "onlineGroupAnnaStrok.offers.libraryAccess",
        prices: {
          pln: 280,
          eur: 65,
        },
        telegramAccessDurationDays: 0,
      },
      {
        accessWorkflow: "telegram-renewal",
        code: "renewal-discount",
        deliveryChannel: "telegram",
        id: ONLINE_GROUP_RENEWAL_OFFER_ID,
        label: "Standard renewal",
        labelKey: "onlineGroupAnnaStrok.offers.renewalDiscount",
        prices: {
          pln: 175,
          eur: 40,
        },
        telegramAccessDurationDays: 0,
      },
      {
        accessWorkflow: "telegram-renewal",
        code: "renewal-library-access",
        deliveryChannel: "telegram",
        id: ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
        label: "Plus renewal",
        labelKey: "onlineGroupAnnaStrok.offers.renewalLibraryAccess",
        prices: {
          pln: 220,
          eur: 50,
        },
        telegramAccessDurationDays: 0,
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
