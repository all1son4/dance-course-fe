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
  onlineGroupInviteLinks: "/admin/api/online-group-invite-links",
  onlineGroupSettings: "/admin/api/online-group-settings",
  renewalCampaigns: "/admin/api/renewal-campaigns",
  sales: "/admin/api/sales",
  telegramChats: "/admin/api/telegram/chats",
} as const;

export const ADMIN_SESSION_HEARTBEAT_MS = 5 * 60_000;
export const JOURNAL_SKELETON_COUNT = 3;

export const ADMIN_FEATURES: AdminFeature[] = [
  { id: "invite-links", label: "Invite-ссылки" },
  { id: "online-group", label: "Online Group" },
  { id: "sales", label: "Продажи" },
  { id: "broadcasts", label: "Рассылки" },
  { id: "reports", label: "Отчеты" },
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
  sales: {
    description:
      "Включай и выключай продажи по каждому продукту. Выключенный продукт остается на сайте, но кнопки покупки пропадают, а оплатить его нельзя даже по прямой ссылке.",
  },
  reports: {
    description:
      "Выбери месяц, сформируй отчет по подтвержденным продажам и отправь его на рабочую почту.",
  },
};
