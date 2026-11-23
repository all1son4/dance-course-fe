import { ValidationError } from "yup";

import {
  INITIAL_CUSTOMER_DATA,
  normalizePaymentCustomerFieldValue,
} from "@/app/[locale]/payment/payment.constants";
import { getPaymentCustomerSchema } from "@/app/[locale]/payment/payment.validation";

import type { CourseSignupFormValues } from "./CourseSignupDialog.types";

/* The signup form's pure steps: settling typed values, validating, the request body. */

export type SubmitFailureReason =
  "network" | "rateLimited" | "server" | "unknown" | "validation";
export type CourseSignupTouchedFields = Partial<
  Record<keyof CourseSignupFormValues, boolean>
>;
export const SIGNUP_FIELD_NAMES = [
  "fullName",
  "socialContact",
  "email",
  "consentAccepted",
] as const satisfies Array<keyof CourseSignupFormValues>;
export type SignupTextFieldName = Exclude<
  keyof CourseSignupFormValues,
  "consentAccepted"
>;
export const getAllTouchedSignupFields = () =>
  SIGNUP_FIELD_NAMES.reduce<CourseSignupTouchedFields>((nextTouchedFields, field) => {
    nextTouchedFields[field] = true;
    return nextTouchedFields;
  }, {});

const normalizeSignupTextFieldValue = (fieldName: SignupTextFieldName, value: string) => {
  if (fieldName === "fullName" || fieldName === "email") {
    return normalizePaymentCustomerFieldValue(fieldName, value);
  }

  return value.replace(/\s+/g, " ").trimStart();
};

/**
 * Values are kept as typed (normalising on every keystroke throws the caret
 * to the end of the field); this is the form they settle into on blur, on
 * submit and in the request. Validation always looks at the settled form, so
 * a field mid-edit reads exactly like the value it is about to become.
 */
export const settleSignupField = (
  fieldName: keyof CourseSignupFormValues,
  currentValues: CourseSignupFormValues,
): CourseSignupFormValues =>
  fieldName === "consentAccepted"
    ? currentValues
    : {
        ...currentValues,
        [fieldName]: normalizeSignupTextFieldValue(fieldName, currentValues[fieldName]),
      };

export const settleSignupValues = (currentValues: CourseSignupFormValues) =>
  SIGNUP_FIELD_NAMES.reduce<CourseSignupFormValues>(
    (settledValues, fieldName) => settleSignupField(fieldName, settledValues),
    currentValues,
  );

export const getSubmitFailureReason = (
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

export const validatePaymentSignupField = ({
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

export const buildCourseSignupRequestBody = ({
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
