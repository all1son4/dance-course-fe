import { describeErrorCode, getSafeErrorCategory } from "./error-log/error-code";

export { getSafeErrorCategory };

/*
 * Never log an exception directly: provider and database messages may contain PII.
 * Each failure goes to the console with its safe code and, on the server, to the
 * application's event log through the sink `src/instrumentation.ts` registers. This
 * module stays free of the database and of `next/server`: the browser imports it too.
 */

export type OperationalEventSinkInput = {
  area: ReturnType<typeof describeErrorCode>["area"];
  code: string;
  event: string;
  reference: string | null;
  severity: "error" | "warning";
};
type OperationalEventSink = (input: OperationalEventSinkInput) => void;

// On globalThis: the instrumentation and the routes may be separate bundles.
const SINK_KEY = Symbol.for("dance-course.operational-event-sink");
type SinkHolder = { [SINK_KEY]?: OperationalEventSink | null };

export const setOperationalEventSink = (sink: OperationalEventSink | null) => {
  (globalThis as SinkHolder)[SINK_KEY] = sink;
};

type SafeErrorOptions = {
  /** A purchase or payment id the failure was about; never a person's data. */
  reference?: string | null;
  /** An expected, self-healing failure worth seeing, not a broken flow. */
  severity?: "error" | "warning";
};

export const logSafeError = (
  context: string,
  error: unknown,
  { reference = null, severity = "error" }: SafeErrorOptions = {},
) => {
  const { area, code } = describeErrorCode(error);
  console.error(context, { errorCategory: getSafeErrorCategory(error), code });

  const sink = (globalThis as SinkHolder)[SINK_KEY];
  if (!sink) return;
  try {
    sink({ area, code, event: context, reference, severity });
  } catch {
    // The log never fails its caller.
  }
};
