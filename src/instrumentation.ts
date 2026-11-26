import type { Instrumentation } from "next";

/*
 * The application's own event log (`operational_events`): on the Node.js server,
 * every `logSafeError` is also recorded, and so is any error no code caught.
 */

const isNodeServer = () => process.env.NEXT_RUNTIME === "nodejs";

export async function register() {
  if (!isNodeServer()) return;

  const { setOperationalEventSink } = await import("./lib/safe-error-log");
  const { recordAfterResponse } = await import("./lib/error-log/server-sink");
  setOperationalEventSink(recordAfterResponse);
}

/** A crash no code caught: by its route, with the safe code only. */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  _request,
  context,
) => {
  if (!isNodeServer()) return;

  const { describeErrorCode } = await import("./lib/error-log/error-code");
  const { withConnectionFacts, writeOperationalEvent } =
    await import("./lib/error-log/server-sink");
  const { area, code } = describeErrorCode(error);
  await writeOperationalEvent(
    withConnectionFacts({
      area,
      code,
      event: `Unhandled server error: ${context.routePath}`,
      reference: null,
      severity: "error",
    }),
  );
};
