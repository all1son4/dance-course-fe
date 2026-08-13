import { eq } from "drizzle-orm";

import { getDatabase } from "./client";
import { findPaymentRecordByIntentIdFromDatabase } from "./payment-records";
import { accessEntitlements, purchases } from "./schema";

type AccessStatus = typeof accessEntitlements.$inferInsert.status;
type ExternalTargetType = typeof accessEntitlements.$inferInsert.externalTargetType;

export type UpdateTelegramAccessCommand = {
  accessWorkflow: string | null;
  currentTokenId?: string | null;
  deliveryChannel: string | null;
  expiresAt?: Date | null;
  externalTargetType: ExternalTargetType;
  initialStatus: AccessStatus;
  paymentIntentId: string;
  revokedAt?: Date | null;
  revokedReason?: string | null;
  startsAt?: Date | null;
  status?: AccessStatus;
  telegramChatId?: string | null;
  telegramUserId?: string | null;
  telegramUsername?: string | null;
  updatedAt: Date;
};

const requirePaymentIntentId = (value: string) => {
  const paymentIntentId = value.trim();

  if (!paymentIntentId) {
    throw new Error("telegram_access_payment_intent_id_required");
  }

  return paymentIntentId;
};

export const updateTelegramAccessInDatabase = async (
  command: UpdateTelegramAccessCommand,
) => {
  const paymentIntentId = requirePaymentIntentId(command.paymentIntentId);
  const set = {
    ...(command.currentTokenId === undefined
      ? {}
      : { currentTokenId: command.currentTokenId }),
    ...(command.expiresAt === undefined ? {} : { expiresAt: command.expiresAt }),
    ...(command.revokedAt === undefined ? {} : { revokedAt: command.revokedAt }),
    ...(command.revokedReason === undefined
      ? {}
      : { revokedReason: command.revokedReason }),
    ...(command.startsAt === undefined ? {} : { startsAt: command.startsAt }),
    ...(command.status === undefined ? {} : { status: command.status }),
    ...(command.telegramChatId === undefined
      ? {}
      : { telegramChatId: command.telegramChatId }),
    ...(command.telegramUserId === undefined
      ? {}
      : { telegramUserId: command.telegramUserId }),
    ...(command.telegramUsername === undefined
      ? {}
      : { telegramUsername: command.telegramUsername }),
    updatedAt: command.updatedAt,
  };

  await getDatabase().transaction(async (transaction) => {
    const [purchase] = await transaction
      .select({
        customerId: purchases.customerId,
        id: purchases.id,
        offerId: purchases.offerId,
        productId: purchases.productId,
      })
      .from(purchases)
      .where(eq(purchases.paymentIntentId, paymentIntentId))
      .limit(1);

    if (!purchase) {
      throw new Error("telegram_access_purchase_not_found");
    }

    await transaction
      .insert(accessEntitlements)
      .values({
        accessKey: "primary",
        accessWorkflow: command.accessWorkflow,
        customerId: purchase.customerId,
        deliveryChannel: command.deliveryChannel,
        externalTargetType: command.externalTargetType,
        offerId: purchase.offerId,
        productId: purchase.productId,
        purchaseId: purchase.id,
        status: command.status ?? command.initialStatus,
        ...set,
      })
      .onConflictDoUpdate({
        set,
        target: [accessEntitlements.purchaseId, accessEntitlements.accessKey],
      });
  });

  const paymentRecord = await findPaymentRecordByIntentIdFromDatabase(paymentIntentId);

  if (!paymentRecord) {
    throw new Error("telegram_access_projection_not_found");
  }

  return paymentRecord;
};
