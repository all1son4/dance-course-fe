import { getDomainPersistenceMode } from "@/db/domain-persistence";

export type StripeWriteRuntime = "database" | "legacy";

export const getStripeWriteRuntime = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): StripeWriteRuntime => {
  const paymentEventsMode = getDomainPersistenceMode("paymentEvents", environment);
  const sideEffectsMode = getDomainPersistenceMode("sideEffects", environment);
  const databaseModes = [paymentEventsMode, sideEffectsMode].filter(
    (mode) => mode === "database",
  ).length;

  if (databaseModes === 0) {
    return "legacy";
  }

  if (databaseModes === 2) {
    return "database";
  }

  throw new Error("stripe_write_modes_must_switch_together");
};
