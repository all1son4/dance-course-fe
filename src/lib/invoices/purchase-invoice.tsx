import path from "node:path";

import {
  Document,
  Font,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type { PaymentSheetRecord } from "@/lib/google-sheets";
import { getLocalizedOfferMetadataByOfferId } from "@/lib/sellable-products-localization";

const SELLER_NAME = "Hanna Karzhova";
const SELLER_ADDRESS_LINES = [
  "Jana Kazimierza 64A",
  "660",
  "01-248 Warsaw",
  "Poland",
  "NIP 5273113119",
];

const DEFAULT_INVOICE_DATE_TIME_ZONE = "Europe/Warsaw";
const PDF_FONT_FAMILY = "Noto Sans";

const invoiceFontDirectory = path.join(process.cwd(), "public", "fonts");

Font.register({
  family: PDF_FONT_FAMILY,
  fonts: [
    {
      fontWeight: 400,
      src: path.join(invoiceFontDirectory, "NotoSans-Regular.ttf"),
    },
    {
      fontWeight: 700,
      src: path.join(invoiceFontDirectory, "NotoSans-Bold.ttf"),
    },
  ],
});

export type PurchaseInvoiceAttachment = {
  content: string;
  filename: string;
};

export type BuildPurchaseInvoiceAttachmentInput = {
  issuedAt: Date;
  paymentRecord: PaymentSheetRecord;
};

type PurchaseInvoiceDocumentProps = {
  amountLabel: string;
  buyerAddressLines: string[];
  buyerEmail: string;
  buyerName: string;
  description: string;
  dueDateLabel: string;
  invoiceNumber: string;
  issueDateLabel: string;
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: "#000000",
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 10,
    lineHeight: 1.34,
    paddingBottom: 52,
    paddingLeft: 56,
    paddingRight: 56,
    paddingTop: 58,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 31,
  },
  title: {
    fontSize: 25,
    fontWeight: 700,
  },
  brand: {
    color: "#6f6f6f",
    fontSize: 25,
    fontWeight: 700,
  },
  meta: {
    marginBottom: 26,
    width: 230,
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: 700,
    width: 96,
  },
  metaValue: {
    fontSize: 11,
  },
  partyRow: {
    flexDirection: "row",
    gap: 72,
    marginBottom: 39,
  },
  party: {
    width: 190,
  },
  partyTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 5,
  },
  partyLine: {
    fontSize: 11,
    marginBottom: 2,
  },
  amountDue: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 33,
  },
  tableHeader: {
    borderBottomColor: "#000000",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingBottom: 8,
  },
  tableRow: {
    flexDirection: "row",
    paddingTop: 8,
  },
  descriptionCell: {
    fontSize: 11,
    paddingRight: 10,
    width: "59%",
  },
  qtyCell: {
    fontSize: 11,
    textAlign: "right",
    width: "7%",
  },
  unitPriceCell: {
    fontSize: 11,
    textAlign: "right",
    width: "17%",
  },
  amountCell: {
    fontSize: 11,
    textAlign: "right",
    width: "17%",
  },
  totals: {
    alignSelf: "flex-end",
    marginTop: 24,
    width: 250,
  },
  totalRow: {
    borderTopColor: "#e4e4e4",
    borderTopWidth: 1,
    flexDirection: "row",
    paddingBottom: 2,
    paddingTop: 4,
  },
  totalLabel: {
    fontSize: 11,
    width: "55%",
  },
  totalValue: {
    fontSize: 11,
    textAlign: "right",
    width: "45%",
  },
  totalLabelStrong: {
    fontSize: 11,
    fontWeight: 700,
    width: "55%",
  },
  totalValueStrong: {
    fontSize: 11,
    fontWeight: 700,
    textAlign: "right",
    width: "45%",
  },
  footer: {
    borderTopColor: "#e6e6e6",
    borderTopWidth: 1,
    bottom: 58,
    left: 56,
    paddingTop: 32,
    position: "absolute",
    right: 56,
  },
  footerText: {
    fontSize: 9,
  },
});

const trimAndCollapseSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

const stripUnsupportedPdfCharacters = (value: string) =>
  trimAndCollapseSpaces(value)
    .replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .replace(/[–—]/gu, "-")
    .replace(/[^\x20-\x7E]/gu, "");

const getInvoiceDate = (date: Date) => (Number.isNaN(date.getTime()) ? new Date() : date);

const formatInvoiceDate = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: DEFAULT_INVOICE_DATE_TIME_ZONE,
    year: "numeric",
  }).format(getInvoiceDate(date));

const formatInvoiceAmount = ({
  amountMinor,
  currency,
}: {
  amountMinor: string;
  currency: string;
}) => {
  const parsedAmountMinor = Number.parseInt(amountMinor, 10);
  const normalizedCurrency = currency.trim().toUpperCase();

  if (!Number.isFinite(parsedAmountMinor) || !normalizedCurrency) {
    return [amountMinor.trim(), normalizedCurrency].filter(Boolean).join(" ").trim();
  }

  const amount = parsedAmountMinor / 100;

  try {
    return new Intl.NumberFormat("en-US", {
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      style: "currency",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${normalizedCurrency}`;
  }
};

const formatCountryName = (country: string) => {
  const normalizedCountry = trimAndCollapseSpaces(country);
  const countryCode = normalizedCountry.toUpperCase();

  if (!/^[A-Z]{2}$/u.test(countryCode)) {
    return normalizedCountry;
  }

  try {
    return (
      new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? countryCode
    );
  } catch {
    return countryCode;
  }
};

const getInvoiceNumber = (paymentRecord: PaymentSheetRecord) => {
  const savedInvoiceNumber = paymentRecord.invoice_number.trim();

  if (savedInvoiceNumber) {
    return savedInvoiceNumber;
  }

  // Fallback for manual/local rendering before the persisted invoice number exists.
  const paymentIntentId = paymentRecord.payment_intent_id;
  const normalizedPaymentIntentId = paymentIntentId.trim();

  if (!normalizedPaymentIntentId) {
    return `INV-${Date.now()}`;
  }

  const compactPaymentIntentId = normalizedPaymentIntentId
    .replace(/^pi_/u, "")
    .replace(/[^A-Za-z0-9]/gu, "")
    .toUpperCase();

  return `INV-${compactPaymentIntentId.slice(-12) || compactPaymentIntentId}`;
};

const getInvoiceFilename = (invoiceNumber: string) =>
  `${invoiceNumber.replace(/[^A-Za-z0-9_-]+/gu, "-")}.pdf`;

const getPurchaseDescription = (paymentRecord: PaymentSheetRecord) => {
  const englishOfferMetadata = getLocalizedOfferMetadataByOfferId(
    paymentRecord.offer_id,
    "en",
  );

  if (englishOfferMetadata) {
    return stripUnsupportedPdfCharacters(
      `${englishOfferMetadata.productTitle} - ${englishOfferMetadata.offerLabel}`,
    );
  }

  const productTitle = stripUnsupportedPdfCharacters(paymentRecord.product_title);
  const offerLabel = stripUnsupportedPdfCharacters(paymentRecord.offer_label);

  if (productTitle && offerLabel) {
    return `${productTitle} - ${offerLabel}`;
  }

  return (
    productTitle ||
    offerLabel ||
    stripUnsupportedPdfCharacters(paymentRecord.purchase_item) ||
    "Course purchase"
  );
};

const getBuyerAddressLines = (paymentRecord: PaymentSheetRecord) =>
  [
    trimAndCollapseSpaces(paymentRecord.customer_address),
    [paymentRecord.customer_postal_code, paymentRecord.customer_city]
      .map(trimAndCollapseSpaces)
      .filter(Boolean)
      .join(" "),
    formatCountryName(paymentRecord.customer_country),
  ].filter(Boolean);

const PurchaseInvoiceDocument = ({
  amountLabel,
  buyerAddressLines,
  buyerEmail,
  buyerName,
  description,
  dueDateLabel,
  invoiceNumber,
  issueDateLabel,
}: PurchaseInvoiceDocumentProps) => (
  <Document
    author={SELLER_NAME}
    creator="dance-course-frontend"
    producer="dance-course-frontend"
    subject={`Invoice ${invoiceNumber}`}
    title={`Invoice ${invoiceNumber}`}
  >
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Invoice</Text>
        <Text style={styles.brand}>{SELLER_NAME}</Text>
      </View>

      <View style={styles.meta}>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Invoice number</Text>
          <Text style={styles.metaValue}>{invoiceNumber}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Date of issue</Text>
          <Text style={styles.metaValue}>{issueDateLabel}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Date due</Text>
          <Text style={styles.metaValue}>{dueDateLabel}</Text>
        </View>
      </View>

      <View style={styles.partyRow}>
        <View style={styles.party}>
          <Text style={styles.partyTitle}>{SELLER_NAME}</Text>
          {SELLER_ADDRESS_LINES.map((line) => (
            <Text key={line} style={styles.partyLine}>
              {line}
            </Text>
          ))}
        </View>

        <View style={styles.party}>
          <Text style={styles.partyTitle}>Bill to</Text>
          <Text style={styles.partyLine}>{buyerName || buyerEmail || "Customer"}</Text>
          {buyerAddressLines.map((line) => (
            <Text key={line} style={styles.partyLine}>
              {line}
            </Text>
          ))}
          {buyerEmail ? <Text style={styles.partyLine}>{buyerEmail}</Text> : null}
        </View>
      </View>

      <Text style={styles.amountDue}>
        {amountLabel} due {dueDateLabel}
      </Text>

      <View style={styles.tableHeader}>
        <Text style={styles.descriptionCell}>Description</Text>
        <Text style={styles.qtyCell}>Qty</Text>
        <Text style={styles.unitPriceCell}>Unit price</Text>
        <Text style={styles.amountCell}>Amount</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={styles.descriptionCell}>{description}</Text>
        <Text style={styles.qtyCell}>1</Text>
        <Text style={styles.unitPriceCell}>{amountLabel}</Text>
        <Text style={styles.amountCell}>{amountLabel}</Text>
      </View>

      <View style={styles.totals}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{amountLabel}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{amountLabel}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabelStrong}>Amount due</Text>
          <Text style={styles.totalValueStrong}>{amountLabel}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {invoiceNumber} · {amountLabel} due {dueDateLabel}
        </Text>
      </View>
    </Page>
  </Document>
);

export const buildPurchaseInvoiceAttachment = async ({
  issuedAt,
  paymentRecord,
}: BuildPurchaseInvoiceAttachmentInput): Promise<PurchaseInvoiceAttachment> => {
  const invoiceNumber = getInvoiceNumber(paymentRecord);
  const amountLabel = formatInvoiceAmount({
    amountMinor: paymentRecord.amount,
    currency: paymentRecord.checkout_currency || paymentRecord.currency,
  });
  const issueDateLabel = formatInvoiceDate(issuedAt);
  const dueDateLabel = issueDateLabel;
  const buffer = await renderToBuffer(
    <PurchaseInvoiceDocument
      amountLabel={amountLabel}
      buyerAddressLines={getBuyerAddressLines(paymentRecord)}
      buyerEmail={trimAndCollapseSpaces(paymentRecord.customer_email)}
      buyerName={trimAndCollapseSpaces(paymentRecord.customer_full_name)}
      description={getPurchaseDescription(paymentRecord)}
      dueDateLabel={dueDateLabel}
      invoiceNumber={invoiceNumber}
      issueDateLabel={issueDateLabel}
    />,
  );

  return {
    content: buffer.toString("base64"),
    filename: getInvoiceFilename(invoiceNumber),
  };
};
