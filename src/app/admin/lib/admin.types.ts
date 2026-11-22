// The purchases wire shapes are owned by the db layer that produces them;
// type-only imports are erased at build time, so nothing server-side leaks
// into the client bundle.
import type {
  AdminProductBreakdownEntry,
  AdminPurchaseListEntry as AdminPurchaseEntry,
  AdminPurchasesPreviousSummary,
  AdminPurchasesSummary,
} from "@/db/admin-sales";

export type {
  AdminProductBreakdownEntry,
  AdminPurchaseEntry,
  AdminPurchasesPreviousSummary,
  AdminPurchasesSummary,
};

export type PurchaseOutcome = AdminPurchaseEntry["outcome"];

export type AdminFeatureId =
  | "overview"
  | "purchases"
  | "sales"
  | "online-group"
  | "inspiration-hub"
  | "invite-links"
  | "broadcasts"
  | "operations";
export type AdminFeatureGroup = "home" | "sales" | "products" | "more";
export type GeneratorKind = "choreo" | "first-touch";
export type LessonLanguage = "en" | "ru";
export type LinkState = "active" | "expired" | "used";
/** `progress` is «делаю…»: the busy button already says it, so nothing else shows it. */
export type StatusTone = "error" | "info" | "progress" | "success";
export type AuthState = "authorized" | "checking" | "locked";

export type AdminFeature = {
  id: AdminFeatureId;
  label: string;
  group: AdminFeatureGroup;
};

export type ChoreoSelection = {
  key: string;
  label: string;
  lessonLanguage: LessonLanguage;
  offerId: string;
  productId: string;
};

export type StatusMessage = {
  text: string;
  tone: StatusTone;
} | null;

export type SelectOption = {
  label: string;
  value: string;
};

export type GeneratedLinkEntry = {
  accessUrl: string;
  /** In «Архив»: removed by hand, or over (used a week ago, expired a month ago). */
  archived?: "manual" | "auto" | null;
  purchaseId?: string;
  adminLabel: string;
  createdAtIso: string;
  linkState: LinkState;
  selectionLabel: string;
  tokenExpiresAt: string;
};

export type TelegramChatOption = {
  chatId: string;
  title: string;
  type: string;
  updatedAt: string;
};

export type RenewalCampaignEntry = {
  checkoutUrl: string;
  createdAt: string;
  id: string;
  offerId: string;
  slug: string;
  sourceChatId: string;
  sourceChatIds: string[];
  sourceChatTitle: string;
  sourceChatTitles: string[];
  status: string;
  targetChatId: string;
  title: string;
};

export type OnlineGroupCampaignEntry = {
  createdAt: string;
  id: string;
  inspirationChatId: string;
  mainChatId: string;
  startsAt: string;
  status: string;
  title: string;
};

export type AuthResponse = {
  authorized?: boolean;
  errorCode?: string;
};

export type GenerateResponse = {
  accessUrl?: string;
  errorCode?: string;
  reason?: string;
  status?: string;
  tokenExpiresAt?: string;
};

export type HistoryResponse = {
  errorCode?: string;
  items?: GeneratedLinkEntry[];
  stale?: boolean;
};

export type TelegramChatsResponse = {
  chats?: TelegramChatOption[];
  errorCode?: string;
};

export type RenewalCampaignsResponse = {
  campaign?: {
    checkoutUrl: string;
    createdAt: string;
    id: string;
    offerId: string;
    productId: string;
    slug: string;
    sourceChatIds: string[];
    sourceChatTitles: string[];
    targetChatTitle: string;
    title: string;
  };
  campaigns?: RenewalCampaignEntry[];
  errorCode?: string;
  reused?: boolean;
  status?: string;
};

export type OnlineGroupCampaignsResponse = {
  campaign?: OnlineGroupCampaignEntry & {
    inspirationChatTitle: string;
    mainChatTitle: string;
  };
  campaigns?: OnlineGroupCampaignEntry[];
  errorCode?: string;
  reused?: boolean;
  status?: string;
};

export type MonthlySalesReportResponse = {
  deliveredAtUtc?: string | null;
  deliveredTo?: string;
  endUtcIso?: string;
  errorCode?: string;
  generatedAtUtc?: string;
  isAlreadyDelivered?: boolean;
  month?: string;
  rowCount?: number;
  sha256?: string;
  skippedReason?: "already_delivered" | "empty" | null;
  startUtcIso?: string;
  status?: "failed" | "sent" | "skipped";
};

export type BroadcastStats = {
  excluded: number;
  failed: number;
  pending: number;
  sent: number;
  total: number;
};

export type BroadcastAudienceLead = {
  createdAt: string;
  email: string;
  fullName: string;
  leadId: string;
  locale: string;
  socialContact: string;
  status: "failed" | "pending";
};

export type BroadcastExclusionScope = "campaign" | "global";

export type FirstTouchBroadcastResponse = {
  audience?: BroadcastAudienceLead[];
  errorCode?: string;
  exclusion?: {
    leadId: string;
    scope: BroadcastExclusionScope;
  };
  result?: BroadcastStats & {
    attempted: number;
  };
  stats?: BroadcastStats;
};

export type OperationsQueueStatus = {
  deadLetters: number;
  oldestReadyAgeSeconds: number | null;
  ready: number;
  retries: number;
  staleLeases: number;
  working: number;
};

export type OperationsInboxDeadLetter = {
  attemptCount: number;
  deadLetteredAt: string;
  errorCode: string;
  errorMessage: string;
  eventType: string;
  paymentIntentId: string;
  stripeEventId: string;
};

export type OperationsOutboxDeadLetter = {
  attemptCount: number;
  deadLetteredAt: string;
  deduplicationKey: string;
  kind: string;
  lastErrorCode: string;
  lastErrorMessage: string;
  recipient: string;
};

export type ProblemAccessEntitlement = {
  customerEmail: string;
  customerName: string;
  entitlementId: string;
  paymentIntentId: string;
  productTitle: string;
  status: "link_failed" | "manual_pending";
  updatedAt: string;
};

export type OperationsSnapshot = {
  access: {
    linkFailed: number;
    manualPending: number;
    pending: number;
  };
  capturedAt: string;
  inbox: OperationsQueueStatus;
  inboxDeadLetters: OperationsInboxDeadLetter[];
  outbox: OperationsQueueStatus;
  outboxDeadLetters: OperationsOutboxDeadLetter[];
  problemEntitlements: ProblemAccessEntitlement[];
  projection: {
    unlinkedProcessedEvents: number;
    unverifiedEvents: number;
  };
  reports: Record<string, number>;
  /** The event journal of the last 30 days, one row per event and code. */
  events: OperationsEventGroup[];
};

export type OperationsEventGroup = {
  area: "telegram" | "stripe" | "email" | "database" | "app";
  event: string;
  code: string;
  severity: "error" | "warning";
  occurrences: number;
  days: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastReference: string | null;
  title: string;
  explanation: string;
};

export type OperationsSnapshotResponse = Partial<OperationsSnapshot> & {
  errorCode?: string;
};

export type OperationsReplayResponse = {
  errorCode?: string;
  status?: string;
};

export type ReissuedAccessLink = {
  accessKey: string;
  accessUrl: string;
  label: string;
  tokenExpiresAt: string;
};

export type ReissueAccessResponse = {
  errorCode?: string;
  links?: ReissuedAccessLink[];
  status?: "no_links" | "not_applicable" | "partial" | "ready";
};

export type AdminPurchasesResponse = {
  errorCode?: string;
  months?: SelectOption[];
  previousSummary?: AdminPurchasesPreviousSummary | null;
  products?: AdminProductBreakdownEntry[];
  purchases?: AdminPurchaseEntry[];
  summary?: AdminPurchasesSummary;
};

export type PolishTerminalUpdateResponse = {
  errorCode?: string;
  paymentIntentId?: string;
  terminalRecordedAtIso?: string;
};

export type ResendPurchaseEmailResponse = {
  errorCode?: string;
  status?: "sent" | "skipped";
};

export type SalesProductOffer = {
  code: string;
  label: string;
  offerId: string;
  price: string;
  salesEnabled: boolean;
};

export type SalesProductEntry = {
  /** Why the Online Group cannot be sold now (HUB-D13); empty otherwise. */
  campaignIssue: string;
  code: string;
  hasActiveCampaign: boolean;
  offers: SalesProductOffer[];
  missingLessonLanguages: string[];
  productId: string;
  requiresActiveCampaign: boolean;
  salesEnabled: boolean;
  title: string;
  type: "choreo" | "course";
};

export type SalesStateResponse = {
  activeCampaignTitle?: string;
  errorCode?: string;
  products?: SalesProductEntry[];
};
