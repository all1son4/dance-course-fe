import { and, eq } from "drizzle-orm";

import { getDatabase } from "./client";
import { stripeEvents } from "./schema";

export type VerifiedStripeInboxEvent = {
  apiVersion: string | null;
  eventType: string;
  livemode: boolean;
  payload: Record<string, unknown>;
  receivedAt?: Date;
  stripeCreatedAt: Date;
  stripeEventId: string;
};

export type StripeInboxReceipt = {
  duplicate: boolean;
  id: string;
  processingStatus:
    | "pending"
    | "processing"
    | "processed"
    | "skipped"
    | "failed"
    | "dead_letter";
};

const requireNonEmpty = (value: string, field: string) => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`stripe_inbox_${field}_required`);
  }

  return normalizedValue;
};

export const recordVerifiedStripeEvent = async (
  event: VerifiedStripeInboxEvent,
): Promise<StripeInboxReceipt> => {
  const stripeEventId = requireNonEmpty(event.stripeEventId, "event_id");
  const eventType = requireNonEmpty(event.eventType, "event_type");
  const db = getDatabase();
  const [inserted] = await db
    .insert(stripeEvents)
    .values({
      apiVersion: event.apiVersion,
      eventType,
      livemode: event.livemode,
      payload: event.payload,
      processingStatus: "pending",
      providerPayloadVerified: true,
      receivedAt: event.receivedAt ?? new Date(),
      stripeCreatedAt: event.stripeCreatedAt,
      stripeEventId,
    })
    .onConflictDoNothing({ target: stripeEvents.stripeEventId })
    .returning({
      id: stripeEvents.id,
      processingStatus: stripeEvents.processingStatus,
    });

  if (inserted) {
    return {
      duplicate: false,
      ...inserted,
    };
  }

  const [existing] = await db
    .select({
      id: stripeEvents.id,
      processingStatus: stripeEvents.processingStatus,
      providerPayloadVerified: stripeEvents.providerPayloadVerified,
    })
    .from(stripeEvents)
    .where(eq(stripeEvents.stripeEventId, stripeEventId))
    .limit(1);

  if (!existing) {
    throw new Error("stripe_inbox_duplicate_disappeared");
  }

  if (!existing.providerPayloadVerified) {
    const [promoted] = await db
      .update(stripeEvents)
      .set({
        apiVersion: event.apiVersion,
        eventType,
        livemode: event.livemode,
        payload: event.payload,
        providerPayloadVerified: true,
        stripeCreatedAt: event.stripeCreatedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(stripeEvents.id, existing.id),
          eq(stripeEvents.providerPayloadVerified, false),
        ),
      )
      .returning({
        id: stripeEvents.id,
        processingStatus: stripeEvents.processingStatus,
      });

    if (promoted) {
      return {
        duplicate: true,
        ...promoted,
      };
    }

    const [concurrentlyPromoted] = await db
      .select({
        id: stripeEvents.id,
        processingStatus: stripeEvents.processingStatus,
      })
      .from(stripeEvents)
      .where(eq(stripeEvents.id, existing.id))
      .limit(1);

    if (!concurrentlyPromoted) {
      throw new Error("stripe_inbox_duplicate_disappeared");
    }

    return {
      duplicate: true,
      ...concurrentlyPromoted,
    };
  }

  return {
    duplicate: true,
    ...existing,
  };
};
