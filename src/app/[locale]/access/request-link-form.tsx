"use client";

import { type FormEvent, useState } from "react";

import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import { trackAnalyticsEvent } from "@/lib/mixpanel-analytics";

import { RequestForm, RequestMessage, RequestRow } from "./page.styles";

type RequestLinkFormProps = {
  locale: string;
  texts: {
    emailLabel: string;
    error: string;
    invalid: string;
    sent: string;
    submit: string;
  };
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * «Прислать ссылку» (HUB-D30): one field, one answer for every address, so the page
 * never tells whether someone bought anything.
 */
export default function RequestLinkForm({ locale, texts }: RequestLinkFormProps) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [invalid, setInvalid] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = email.trim();

    if (!EMAIL_PATTERN.test(value)) {
      setInvalid(true);
      void trackAnalyticsEvent("my_access_link_request_result", {
        result: "invalid_email",
      });
      return;
    }

    setInvalid(false);
    setState("sending");
    void trackAnalyticsEvent("my_access_link_requested", {});

    try {
      const response = await fetch("/api/access/link", {
        body: JSON.stringify({ email: value, locale }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setState(response.ok ? "sent" : "error");
      void trackAnalyticsEvent("my_access_link_request_result", {
        result: response.ok
          ? "accepted"
          : response.status === 429
            ? "rate_limited"
            : "error",
      });
    } catch {
      setState("error");
      void trackAnalyticsEvent("my_access_link_request_result", { result: "error" });
    }
  };

  if (state === "sent") {
    return (
      <RequestMessage $tone="info" role="status">
        {texts.sent}
      </RequestMessage>
    );
  }

  return (
    <RequestForm onSubmit={handleSubmit} noValidate>
      <RequestRow>
        <Input
          name="email"
          type="email"
          label={texts.emailLabel}
          value={email}
          autoComplete="email"
          inputMode="email"
          enterKeyHint="send"
          errorMessage={invalid ? texts.invalid : ""}
          onChange={(event) => {
            setEmail(event.target.value);
            if (invalid) setInvalid(false);
          }}
        />
        <Button
          buttonText={texts.submit}
          type="submit"
          isLoading={state === "sending"}
          width="260px"
        />
      </RequestRow>
      {state === "error" && (
        <RequestMessage $tone="error" role="alert">
          {texts.error}
        </RequestMessage>
      )}
    </RequestForm>
  );
}
