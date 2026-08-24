import type {
  AdminFeature,
  AdminFeatureId,
  GeneratorKind,
  LessonLanguage,
} from "./admin.types";

export const ADMIN_API_ENDPOINTS = {
  auth: "/admin/auth",
  firstTouchBroadcast: "/admin/api/broadcasts/first-touch-sales-start",
  inviteLinks: "/admin/api/invite-links",
  inviteLinksHistory: "/admin/api/invite-links/history",
  monthlySalesReport: "/admin/api/reports/monthly-sales",
  monthlySalesReportDownload: "/admin/api/reports/monthly-sales/download",
  onlineGroupInviteLinks: "/admin/api/online-group-invite-links",
  onlineGroupSettings: "/admin/api/online-group-settings",
  operations: "/admin/api/operations",
  operationsReissueAccess: "/admin/api/operations/reissue-access",
  operationsReplay: "/admin/api/operations/replay",
  purchases: "/admin/api/purchases",
  purchasesResendEmail: "/admin/api/purchases/resend-email",
  renewalCampaigns: "/admin/api/renewal-campaigns",
  sales: "/admin/api/sales",
  telegramChats: "/admin/api/telegram/chats",
} as const;

export const ADMIN_SESSION_HEARTBEAT_MS = 5 * 60_000;
export const JOURNAL_SKELETON_COUNT = 3;
// Shared between the purchases DB query and the truncation hint in the UI.
export const PURCHASES_LIST_LIMIT = 50;
export const RATE_LIMITED_STATUS_TEXT =
  "Слишком много запросов. Подожди немного и попробуй снова.";

export const ADMIN_FEATURES: AdminFeature[] = [
  { id: "invite-links", label: "Invite-ссылки" },
  { id: "online-group", label: "Online Group" },
  { id: "sales", label: "Каталог" },
  { id: "purchases", label: "Продажи" },
  { id: "broadcasts", label: "Рассылки" },
  { id: "operations", label: "Статус" },
];

export const KIND_OPTIONS: Array<{ label: string; value: GeneratorKind }> = [
  { label: "Первый курс (First Touch)", value: "first-touch" },
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
  broadcasts: {
    description:
      "Проверь количество получателей и запусти разовую рассылку. Повторный запуск не затронет адреса, на которые письмо уже ушло.",
  },
  "invite-links": {
    description:
      "Создай персональную одноразовую ссылку на курс и скопируй её из журнала для отправки участнику.",
  },
  "online-group": {
    description:
      "Настрой активный поток. После запуска здесь появятся ручная выдача доступа и управление продлениями.",
  },
  operations: {
    description:
      "Один взгляд — и понятно, все ли доставилось: оплаты, письма, доступы. Если что-то застряло, оно появится в блоке «Требует действий» с кнопкой починки.",
  },
  purchases: {
    description:
      "Продажи и покупатели: суммы за месяц, поиск по имени или email, переотправка письма о покупке и месячный отчет в CSV.",
  },
  sales: {
    description:
      "Включай и выключай продажи по каждому продукту. Выключенный продукт остается на сайте, но кнопки покупки пропадают, а оплатить его нельзя даже по прямой ссылке.",
  },
};
