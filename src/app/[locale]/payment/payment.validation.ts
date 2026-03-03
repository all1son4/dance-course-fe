import * as yup from "yup";

import type { PaymentCustomerData } from "./payment.constants";

const trimmedRequiredText = (label: string) =>
  yup
    .string()
    .transform((value) => (typeof value === "string" ? value.trim() : ""))
    .required(`Введите ${label.toLowerCase()}`);

export const paymentCustomerSchema: yup.ObjectSchema<PaymentCustomerData> = yup.object({
  name: trimmedRequiredText("имя")
    .min(2, "Имя должно содержать минимум 2 символа")
    .max(50, "Имя должно содержать не больше 50 символов"),
  lastName: trimmedRequiredText("фамилию")
    .min(2, "Фамилия должна содержать минимум 2 символа")
    .max(50, "Фамилия должна содержать не больше 50 символов"),
  email: yup
    .string()
    .transform((value) => (typeof value === "string" ? value.trim() : ""))
    .email("Введите корректный email")
    .required("Введите email"),
  nickname: yup
    .string()
    .matches(
      /^@[A-Za-z0-9_]{1,32}$/,
      "Введите корректный ник Telegram в формате @username",
    )
    .required("Введите ник в Telegram"),
});
