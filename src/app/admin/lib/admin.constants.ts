import type {
  AdminFeature,
  AdminFeatureId,
  GeneratorKind,
  LessonLanguage,
} from "./admin.types";

export const ADMIN_API_ENDPOINTS = {
  auth: "/admin/auth",
  cohortInviteBroadcast: "/admin/api/broadcasts/cohort-invite",
  firstTouchBroadcast: "/admin/api/broadcasts/first-touch-sales-start",
  inviteLinks: "/admin/api/invite-links",
  inviteLinksHistory: "/admin/api/invite-links/history",
  hub: "/admin/api/hub",
  monthlySalesReport: "/admin/api/reports/monthly-sales",
  monthlySalesReportDownload: "/admin/api/reports/monthly-sales/download",
  onlineGroupInviteLinks: "/admin/api/online-group-invite-links",
  onlineGroupSettings: "/admin/api/online-group-settings",
  onlineGroupCohorts: "/admin/api/online-group/cohorts",
  onlineGroupNextCohort: "/admin/api/online-group/cohorts/next",
  onlineGroupCohortPostRetry: "/admin/api/online-group/cohorts/post-retry",
  operations: "/admin/api/operations",
  operationsReissueAccess: "/admin/api/operations/reissue-access",
  operationsReplay: "/admin/api/operations/replay",
  purchases: "/admin/api/purchases",
  purchasesResendEmail: "/admin/api/purchases/resend-email",
  renewalCampaigns: "/admin/api/renewal-campaigns",
  sales: "/admin/api/sales",
  systemPulse: "/admin/api/system/pulse",
  telegramBotRights: "/admin/api/telegram/bot-rights",
  telegramChats: "/admin/api/telegram/chats",
  overview: "/admin/api/overview",
} as const;

export const ADMIN_SESSION_HEARTBEAT_MS = 5 * 60_000;
export const JOURNAL_SKELETON_COUNT = 3;
// Shared between the purchases DB query and the truncation hint in the UI.
export const PURCHASES_LIST_LIMIT = 50;
export const RATE_LIMITED_STATUS_TEXT =
  "Слишком много запросов. Подожди немного и попробуй снова.";

export const ADMIN_FEATURES: AdminFeature[] = [
  { id: "overview", label: "Обзор", group: "home" },
  { id: "purchases", label: "Покупки", group: "sales" },
  { id: "sales", label: "Каталог", group: "sales" },
  { id: "online-group", label: "Online Group", group: "products" },
  { id: "inspiration-hub", label: "Inspiration Hub", group: "products" },
  { id: "invite-links", label: "Ссылки доступа", group: "products" },
  { id: "broadcasts", label: "Рассылки", group: "more" },
  { id: "operations", label: "Система", group: "more" },
];

export const ADMIN_FEATURE_GROUP_LABELS: Record<AdminFeature["group"], string> = {
  home: "",
  more: "Ещё",
  products: "Продукты",
  sales: "Продажи",
};

export const KIND_OPTIONS: Array<{ label: string; value: GeneratorKind }> = [
  { label: "Курс «First Touch»", value: "first-touch" },
  { label: "Разбор", value: "choreo" },
];

export const OFFER_TYPE_LABELS: Record<string, string> = {
  "with-mentor": "С куратором",
  "without-mentor": "Без куратора",
};

export const LESSON_LANGUAGE_LABELS: Record<LessonLanguage, string> = {
  en: "EN",
  ru: "RU",
};

export const ADMIN_FEATURE_COPY: Record<AdminFeatureId, { description: string }> = {
  overview: {
    description:
      "Всё, что требует внимания, ключевые цифры и ближайшие события — в одном месте.",
  },
  "inspiration-hub": {
    description:
      "Telegram-группа библиотеки, оплаченные доступы, проблемы с доступом и кого бот уберёт ночью.",
  },
  broadcasts: {
    description:
      "Выбери рассылку: внутри — получатели и отправка. Повторная отправка не затронет адреса, на которые письмо уже ушло.",
  },
  "invite-links": {
    description:
      "Создай персональную одноразовую ссылку на курс или разбор и скопируй её из журнала, чтобы отправить.",
  },
  "online-group": {
    description: "Потоки, продажи Standard и Plus, ссылки продления и ручные доступы.",
  },
  operations: {
    description:
      "Всё ли доставилось: оплаты, письма и доступы. Если что-то застряло, здесь же кнопка починки.",
  },
  purchases: {
    description:
      "Продажи и покупатели: суммы за месяц, польские оплаты для внесения в кассу, поиск, повторная отправка письма и отчёт за месяц.",
  },
  sales: {
    description:
      "Какие продукты и тарифы сейчас продаются на сайте. Доступы прежних покупателей не меняются.",
  },
};
