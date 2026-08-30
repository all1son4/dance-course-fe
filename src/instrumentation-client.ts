import { trackUnhandledAppError } from "@/lib/mixpanel-analytics";

if (process.env.NODE_ENV === "production") {
  window.addEventListener("error", (event) => {
    const isResourceError = event.target !== null && event.target !== window;
    const errorName =
      event.error instanceof Error
        ? event.error.name
        : isResourceError
          ? "ResourceError"
          : "Error";
    const message = event.error instanceof Error ? event.error.message : event.message;

    void trackUnhandledAppError({
      errorName,
      message,
      source: isResourceError ? "resource" : "window",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;

    void trackUnhandledAppError({
      errorName: reason instanceof Error ? reason.name : "NonErrorRejection",
      message: reason instanceof Error ? reason.message : undefined,
      source: "unhandled_rejection",
    });
  });
}
