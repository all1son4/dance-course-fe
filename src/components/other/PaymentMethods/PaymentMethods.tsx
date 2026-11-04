import { PAYMENT_MARKS } from "./paymentMarks";
import {
  MarkItem,
  MarkList,
  Note,
  PaymentMethodsBox,
  Wordmark,
} from "./PaymentMethods.styles";

type PaymentMethodsProps = {
  /** Accessible name of the list of accepted payment methods. */
  label: string;
  /** One short reassurance line shown next to the marks. */
  note?: string;
  className?: string;
};

export default function PaymentMethods({ className, label, note }: PaymentMethodsProps) {
  return (
    <PaymentMethodsBox className={className}>
      <MarkList aria-label={label}>
        {PAYMENT_MARKS.map(({ name, path }) => (
          <MarkItem key={name}>
            {path ? (
              <svg viewBox="0 0 24 24" role="img" aria-label={name}>
                <path d={path} />
              </svg>
            ) : (
              <Wordmark>{name}</Wordmark>
            )}
          </MarkItem>
        ))}
      </MarkList>
      {note && <Note>{note}</Note>}
    </PaymentMethodsBox>
  );
}
