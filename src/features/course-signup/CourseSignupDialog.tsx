"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent, FormEvent } from "react";
import { useId, useState } from "react";
import { ValidationError } from "yup";

import {
  INITIAL_CUSTOMER_DATA,
  normalizePaymentCustomerFieldValue,
} from "@/app/[locale]/payment/payment.constants";
import { getPaymentCustomerSchema } from "@/app/[locale]/payment/payment.validation";
import Button from "@/components/common/Button";
import Checkbox from "@/components/common/Checkbox";
import Dialog from "@/components/common/Dialog";
import Input from "@/components/common/Input";
import StickyCta from "@/components/other/StickyCta";
import { trackAnalyticsEvent, trackApiError } from "@/lib/mixpanel-analytics";
import { prefersReducedMotion } from "@/lib/reveal";
import { stickyCtaAnchorProps } from "@/lib/sticky-cta";
import { Success } from "@/svg";

import {
  DescriptionSteps,
  ResultIconBox,
  ResultReason,
  ResultState,
  ResultText,
  SignupForm,
} from "./CourseSignupDialog.styles";
import type {
  CourseSignupDialogProps,
  CourseSignupFormValues,
} from "./CourseSignupDialog.types";

type SubmitState = "idle" | "submitting" | "success" | "error";
type SubmitFailureReason =
  | "network"
  | "rateLimited"
  | "server"
  | "unknown"
  | "validation";
type CourseSignupFormErrors = Partial<Record<keyof CourseSignupFormValues, string>>;
type CourseSignupTouchedFields = Partial<Record<keyof CourseSignupFormValues, boolean>>;
type CourseSignupErrorResponse = {
  errorCode?: string;
};

const COURSE_SIGNUP_ENDPOINT = "/api/course-signup";
/** How long the current screen fades before the next one takes its place (see Dialog). */
const CONTENT_LEAVE_MS = 120;
const JSON_CONTENT_TYPE = "application/json";
const SIGNUP_COURSE_ID = "first-touch";
const INITIAL_SIGNUP_VALUES: CourseSignupFormValues = {
  consentAccepted: false,
  email: "",
  fullName: "",
  socialContact: "",
};

const SIGNUP_FIELD_NAMES = [
  "fullName",
  "socialContact",
  "email",
  "consentAccepted",
] as const satisfies Array<keyof CourseSignupFormValues>;

const getAllTouchedSignupFields = () =>
  SIGNUP_FIELD_NAMES.reduce<CourseSignupTouchedFields>((nextTouchedFields, field) => {
    nextTouchedFields[field] = true;
    return nextTouchedFields;
  }, {});

const normalizeSignupTextFieldValue = (
  fieldName: keyof CourseSignupFormValues,
  value: string,
) => {
  if (fieldName === "fullName" || fieldName === "email") {
    return normalizePaymentCustomerFieldValue(fieldName, value);
  }

  return value.replace(/\s+/g, " ").trimStart();
};

const getSubmitFailureReason = (
  errorCode: string | undefined,
  status: number,
): SubmitFailureReason => {
  if (errorCode === "rate_limited" || status === 429) {
    return "rateLimited";
  }

  if (errorCode === "course_signup_failed" || status >= 500) {
    return "server";
  }

  if (
    errorCode === "invalid_email" ||
    errorCode === "invalid_request_body" ||
    errorCode === "missing_consent" ||
    errorCode === "missing_required_fields"
  ) {
    return "validation";
  }

  return "unknown";
};

const validatePaymentSignupField = ({
  fieldName,
  locale,
  values,
}: {
  fieldName: "email" | "fullName";
  locale: string;
  values: CourseSignupFormValues;
}): string => {
  try {
    getPaymentCustomerSchema(locale).validateSyncAt(fieldName, {
      ...INITIAL_CUSTOMER_DATA,
      email: values.email,
      fullName: values.fullName,
    });

    return "";
  } catch (error) {
    if (error instanceof ValidationError) {
      return error.message;
    }

    throw error;
  }
};

const buildCourseSignupRequestBody = ({
  locale,
  values,
}: {
  locale: string;
  values: CourseSignupFormValues;
}) => ({
  consentAccepted: values.consentAccepted,
  email: values.email.trim(),
  fullName: values.fullName.trim(),
  locale,
  socialContact: values.socialContact.trim(),
});

export default function CourseSignupDialog({
  stickyCta,
  triggerText,
}: CourseSignupDialogProps) {
  const locale = useLocale();
  const t = useTranslations("FirstTouchPage.signupDialog");
  const formId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [values, setValues] = useState<CourseSignupFormValues>(INITIAL_SIGNUP_VALUES);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitFailureReason, setSubmitFailureReason] =
    useState<SubmitFailureReason>("unknown");
  const [errors, setErrors] = useState<CourseSignupFormErrors>({});
  const [touchedFields, setTouchedFields] = useState<CourseSignupTouchedFields>({});
  const [isContentLeaving, setIsContentLeaving] = useState(false);

  // Screen changes (form -> result, result -> form) go through the dialog's
  // morph: the current screen fades out, then the state switches and the
  // dialog glides to the new height while the next screen fades in.
  const switchScreen = async (apply: () => void) => {
    if (prefersReducedMotion()) {
      apply();
      return;
    }

    setIsContentLeaving(true);
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, CONTENT_LEAVE_MS);
    });
    apply();
    setIsContentLeaving(false);
  };

  const validateField = (
    fieldName: keyof CourseSignupFormValues,
    nextValues: CourseSignupFormValues = values,
  ) => {
    if (fieldName === "fullName" || fieldName === "email") {
      return validatePaymentSignupField({
        fieldName,
        locale,
        values: nextValues,
      });
    }

    if (fieldName === "socialContact" && !nextValues.socialContact.trim()) {
      return t("fields.socialContact.error");
    }

    if (fieldName === "consentAccepted" && !nextValues.consentAccepted) {
      return t("fields.consent.error");
    }

    return "";
  };

  const updateValue =
    (field: keyof CourseSignupFormValues) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const nextValue = normalizeSignupTextFieldValue(field, event.target.value);
      const nextValues = {
        ...values,
        [field]: nextValue,
      };
      setValues((currentValues) => ({
        ...currentValues,
        [field]: nextValue,
      }));
      setErrors((currentErrors) => ({
        ...currentErrors,
        [field]: touchedFields[field] ? validateField(field, nextValues) : "",
      }));
      setSubmitState("idle");
    };

  const touchAndValidateField = (field: keyof CourseSignupFormValues) => () => {
    setTouchedFields((currentTouchedFields) => ({
      ...currentTouchedFields,
      [field]: true,
    }));
    setErrors((currentErrors) => ({
      ...currentErrors,
      [field]: validateField(field),
    }));
  };

  const validateForm = () => {
    const nextErrors: CourseSignupFormErrors = {};

    SIGNUP_FIELD_NAMES.forEach((fieldName) => {
      const fieldError = validateField(fieldName);

      if (fieldError) {
        nextErrors[fieldName] = fieldError;
      }
    });

    return nextErrors;
  };

  const resetDialogFeedback = () => {
    setSubmitState("idle");
    setSubmitFailureReason("unknown");
    setErrors({});
    setTouchedFields({});
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);

    if (!open) {
      resetDialogFeedback();
    }
  };

  const openDialog = (placement: "inline" | "sticky") => {
    resetDialogFeedback();
    setIsOpen(true);
    void trackAnalyticsEvent("signup_dialog_opened", {
      course_id: SIGNUP_COURSE_ID,
      placement,
    });
  };

  const handleConsentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;

    setValues((currentValues) => ({
      ...currentValues,
      consentAccepted: checked,
    }));
    setErrors((currentErrors) => ({
      ...currentErrors,
      consentAccepted: validateField("consentAccepted", {
        ...values,
        consentAccepted: checked,
      }),
    }));
    setTouchedFields((currentTouchedFields) => ({
      ...currentTouchedFields,
      consentAccepted: true,
    }));
    setSubmitState("idle");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setTouchedFields(getAllTouchedSignupFields());

    const nextErrors = validateForm();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      void trackAnalyticsEvent("signup_validation_failed", {
        course_id: SIGNUP_COURSE_ID,
        invalid_fields: Object.keys(nextErrors),
      });
      return;
    }

    void trackAnalyticsEvent("signup_submitted", {
      course_id: SIGNUP_COURSE_ID,
    });

    setSubmitState("submitting");
    setSubmitFailureReason("unknown");

    try {
      const response = await fetch(COURSE_SIGNUP_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": JSON_CONTENT_TYPE,
        },
        body: JSON.stringify(
          buildCourseSignupRequestBody({
            locale,
            values,
          }),
        ),
      });

      if (!response.ok) {
        const data = (await response
          .json()
          .catch(() => ({}))) as CourseSignupErrorResponse;

        void trackApiError({
          endpoint: COURSE_SIGNUP_ENDPOINT,
          errorCode: data.errorCode,
          failureStage: "signup_submission",
          method: "POST",
          status: response.status,
        });

        if (data.errorCode === "duplicate_email") {
          void trackAnalyticsEvent("signup_failed", {
            course_id: SIGNUP_COURSE_ID,
            reason: "duplicate_email",
          });
          setErrors((currentErrors) => ({
            ...currentErrors,
            email: t("fields.email.duplicateError"),
          }));
          setSubmitState("idle");
          return;
        }

        const failureReason = getSubmitFailureReason(data.errorCode, response.status);
        void trackAnalyticsEvent("signup_failed", {
          course_id: SIGNUP_COURSE_ID,
          reason: failureReason,
        });
        await switchScreen(() => {
          setSubmitFailureReason(failureReason);
          setSubmitState("error");
        });
        return;
      }

      await switchScreen(() => {
        setValues(INITIAL_SIGNUP_VALUES);
        setSubmitState("success");
      });
      void trackAnalyticsEvent("signup_succeeded", {
        course_id: SIGNUP_COURSE_ID,
      });
    } catch {
      void trackApiError({
        endpoint: COURSE_SIGNUP_ENDPOINT,
        failureStage: "signup_submission",
        method: "POST",
      });
      void trackAnalyticsEvent("signup_failed", {
        course_id: SIGNUP_COURSE_ID,
        reason: "network",
      });
      await switchScreen(() => {
        setSubmitFailureReason("network");
        setSubmitState("error");
      });
    }
  };

  const isSubmitting = submitState === "submitting";
  const isSuccess = submitState === "success";
  const isError = submitState === "error";
  const isResult = isSuccess || isError;

  const renderDialogDescription = () =>
    isResult ? undefined : (
      <DescriptionSteps>
        <span>{t("description.intro")}</span>
        <span>{t("description.step1")}</span>
      </DescriptionSteps>
    );

  const renderDialogFooter = () => {
    if (isSuccess) {
      return (
        <Button
          type="button"
          buttonText={t("closeButton")}
          onClick={() => {
            handleOpenChange(false);
          }}
        />
      );
    }

    if (isError) {
      return (
        <Button
          type="button"
          buttonText={t("retryButton")}
          onClick={() => {
            void switchScreen(() => {
              setSubmitState("idle");
            });
          }}
        />
      );
    }

    return (
      <Button
        type="submit"
        form={formId}
        buttonText={t("submitButton")}
        isLoading={isSubmitting}
        disabled={isSubmitting}
      />
    );
  };

  const renderDialogContent = () => {
    if (isSuccess) {
      return (
        <ResultState role="status">
          <ResultIconBox>
            <Success width={128} height={128} />
          </ResultIconBox>
          <ResultText $tone="success">{t("successMessage")}</ResultText>
        </ResultState>
      );
    }

    if (isError) {
      return (
        <ResultState role="alert">
          <ResultText $tone="error">{t("failure.title")}</ResultText>
          <ResultReason>{t(`failure.reasons.${submitFailureReason}`)}</ResultReason>
        </ResultState>
      );
    }

    return (
      <SignupForm id={formId} onSubmit={handleSubmit}>
        <Input
          name="fullName"
          label={t("fields.fullName.label")}
          placeholder={t("fields.fullName.placeholder")}
          value={values.fullName}
          onBlur={touchAndValidateField("fullName")}
          onChange={updateValue("fullName")}
          disabled={isSubmitting}
          errorMessage={errors.fullName}
        />
        <Input
          name="socialContact"
          label={t("fields.socialContact.label")}
          placeholder={t("fields.socialContact.placeholder")}
          value={values.socialContact}
          onBlur={touchAndValidateField("socialContact")}
          onChange={updateValue("socialContact")}
          disabled={isSubmitting}
          errorMessage={errors.socialContact}
        />
        <Input
          name="email"
          type="email"
          label={t("fields.email.label")}
          placeholder={t("fields.email.placeholder")}
          value={values.email}
          onBlur={touchAndValidateField("email")}
          onChange={updateValue("email")}
          disabled={isSubmitting}
          errorMessage={errors.email}
        />
        <Checkbox
          name="first-touch-email-consent"
          checked={values.consentAccepted}
          disabled={isSubmitting}
          errorMessage={errors.consentAccepted}
          onChange={handleConsentChange}
          placeholder={t("fields.consent.label")}
        />
      </SignupForm>
    );
  };

  return (
    <>
      <Button
        type="button"
        buttonText={triggerText}
        onClick={() => openDialog("inline")}
        {...stickyCtaAnchorProps}
      />
      {stickyCta ? (
        <StickyCta
          label={triggerText}
          onClick={() => openDialog("sticky")}
          title={stickyCta.title}
          note={stickyCta.note}
        />
      ) : null}

      <Dialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        title={t("title")}
        // The result screens carry their own big message; the title stays for
        // assistive tech so the dialog keeps its accessible name.
        isTitleVisuallyHidden={isResult}
        description={renderDialogDescription()}
        closeLabel={t("closeLabel")}
        footer={renderDialogFooter()}
        contentKey={isResult ? submitState : "form"}
        isContentLeaving={isContentLeaving}
      >
        {renderDialogContent()}
      </Dialog>
    </>
  );
}
