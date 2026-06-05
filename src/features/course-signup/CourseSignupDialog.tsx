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
import { Button, Checkbox, Dialog, Input } from "@/components";
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

const initialValues: CourseSignupFormValues = {
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

export default function CourseSignupDialog({ triggerText }: CourseSignupDialogProps) {
  const locale = useLocale();
  const t = useTranslations("FirstTouchPage.signupDialog");
  const formId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [values, setValues] = useState<CourseSignupFormValues>(initialValues);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitFailureReason, setSubmitFailureReason] =
    useState<SubmitFailureReason>("unknown");
  const [errors, setErrors] = useState<CourseSignupFormErrors>({});
  const [touchedFields, setTouchedFields] = useState<CourseSignupTouchedFields>({});

  const validateField = (
    fieldName: keyof CourseSignupFormValues,
    nextValues: CourseSignupFormValues = values,
  ) => {
    if (fieldName === "fullName" || fieldName === "email") {
      try {
        getPaymentCustomerSchema(locale).validateSyncAt(fieldName, {
          ...INITIAL_CUSTOMER_DATA,
          email: nextValues.email,
          fullName: nextValues.fullName,
        });

        return "";
      } catch (error) {
        if (error instanceof ValidationError) {
          return error.message;
        }

        throw error;
      }
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

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);

    if (!open) {
      setSubmitState("idle");
      setSubmitFailureReason("unknown");
      setErrors({});
      setTouchedFields({});
    }
  };

  const openDialog = () => {
    setSubmitState("idle");
    setSubmitFailureReason("unknown");
    setErrors({});
    setTouchedFields({});
    setIsOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setTouchedFields(getAllTouchedSignupFields());

    const nextErrors = validateForm();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitState("submitting");
    setSubmitFailureReason("unknown");

    try {
      const response = await fetch("/api/course-signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          consentAccepted: values.consentAccepted,
          email: values.email.trim(),
          fullName: values.fullName.trim(),
          locale,
          socialContact: values.socialContact.trim(),
        }),
      });

      if (!response.ok) {
        const data = (await response
          .json()
          .catch(() => ({}))) as CourseSignupErrorResponse;

        if (data.errorCode === "duplicate_email") {
          setErrors((currentErrors) => ({
            ...currentErrors,
            email: t("fields.email.duplicateError"),
          }));
          setSubmitState("idle");
          return;
        }

        setSubmitFailureReason(getSubmitFailureReason(data.errorCode, response.status));
        setSubmitState("error");
        return;
      }

      setValues(initialValues);
      setSubmitState("success");
    } catch {
      setSubmitFailureReason("network");
      setSubmitState("error");
    }
  };

  const isSubmitting = submitState === "submitting";
  const isSuccess = submitState === "success";
  const isError = submitState === "error";
  const isResult = isSuccess || isError;

  return (
    <>
      <Button type="button" buttonText={triggerText} onClick={openDialog} />

      <Dialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        title={isResult ? undefined : t("title")}
        description={
          isResult ? undefined : (
            <DescriptionSteps>
              <span>{t("description.intro")}</span>
              <span>{t("description.step1")}</span>
            </DescriptionSteps>
          )
        }
        closeLabel={t("closeLabel")}
        footer={
          isSuccess ? (
            <Button
              type="button"
              buttonText={t("closeButton")}
              onClick={() => {
                handleOpenChange(false);
              }}
            />
          ) : isError ? (
            <Button
              type="button"
              buttonText={t("retryButton")}
              onClick={() => {
                setSubmitState("idle");
              }}
            />
          ) : (
            <Button
              type="submit"
              form={formId}
              buttonText={t("submitButton")}
              isLoading={isSubmitting}
              disabled={isSubmitting}
            />
          )
        }
      >
        {isSuccess ? (
          <ResultState>
            <ResultIconBox>
              <Success width={128} height={128} />
            </ResultIconBox>
            <ResultText $tone="success">{t("successMessage")}</ResultText>
          </ResultState>
        ) : isError ? (
          <ResultState>
            <ResultText $tone="error">{t("failure.title")}</ResultText>
            <ResultReason>{t(`failure.reasons.${submitFailureReason}`)}</ResultReason>
          </ResultState>
        ) : (
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
              onChange={(event) => {
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
              }}
              placeholder={t("fields.consent.label")}
            />
          </SignupForm>
        )}
      </Dialog>
    </>
  );
}
