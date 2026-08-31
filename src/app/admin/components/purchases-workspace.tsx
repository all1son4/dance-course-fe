import { LoaderCircle, Mail, RefreshCw } from "lucide-react";

import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import { ACCOUNTING_TIME_ZONE } from "@/lib/accounting-month";
import { formatMinorDelta } from "@/lib/minor-amount";

import { PURCHASES_LIST_LIMIT } from "../lib/admin.constants";
import type {
  AdminProductBreakdownEntry,
  AdminPurchaseEntry,
  AdminPurchasesPreviousSummary,
  AdminPurchasesSummary,
  PurchaseOutcome,
  SelectOption,
  StatusMessage,
} from "../lib/admin.types";
import { formatDateTime } from "../lib/admin.utils";
import {
  AdminDataTable,
  BroadcastActionButton,
  CardFooterActions,
  CardFooterRow,
  DeltaChip,
  HeaderSelectWrap,
  IconActionButton,
  InlineSearchRow,
  JournalEmptyState,
  JournalSkeletonCard,
  JournalSkeletonList,
  ProductBreakdownHeader,
  ProductBreakdownList,
  ProductBreakdownName,
  ProductBreakdownNumbers,
  ProductBreakdownRow,
  ProductShareFill,
  ProductShareTrack,
  SalesProductMeta,
  SalesProductName,
  SalesStatusBadge,
  SalesTableWrap,
  SearchFieldWrap,
  SectionHeading,
  SkeletonLine,
  StatCell,
  StatCellLabel,
  StatCellMeta,
  StatCellValue,
  StatStrip,
  StatusText,
  SurfaceCard,
  SurfaceDescription,
  SurfaceHeaderActions,
  SurfaceHeaderRow,
  SurfaceTitle,
  WorkspaceStack,
} from "../page.styles";

type PurchasesWorkspaceProps = {
  appliedSearch: string;
  isDownloadingReport: boolean;
  isLoading: boolean;
  isSendingReport: boolean;
  monthValue: string;
  months: SelectOption[];
  onClearSearch: () => void | Promise<void>;
  onDownloadReport: () => void | Promise<void>;
  onMonthChange: (value: string) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onResendEmail: (paymentIntentId: string) => void | Promise<void>;
  onSearchInputChange: (value: string) => void;
  onSendReport: () => void | Promise<void>;
  onSubmitSearch: () => void | Promise<void>;
  previousSummary: AdminPurchasesPreviousSummary | null;
  products: AdminProductBreakdownEntry[];
  purchases: AdminPurchaseEntry[];
  reportStatus: StatusMessage;
  resendingPaymentIntentId: string;
  searchInput: string;
  status: StatusMessage;
  summary: AdminPurchasesSummary | null;
};

const OUTCOME_META: Record<
  PurchaseOutcome,
  { label: string; state: "blocked" | "closed" | "open" }
> = {
  canceled: { label: "Отменена", state: "closed" },
  failed: { label: "Не прошла", state: "closed" },
  processing: { label: "В процессе", state: "blocked" },
  requires_action: { label: "Ждет действия", state: "blocked" },
  succeeded: { label: "Оплачено", state: "open" },
};

const MonthDelta = ({
  delta,
  formattedDelta,
}: {
  delta: number;
  formattedDelta: string;
}) => {
  if (delta === 0) {
    return <>как в прошлом месяце</>;
  }

  return (
    <>
      <DeltaChip $direction={delta > 0 ? "up" : "down"}>{formattedDelta}</DeltaChip>к
      прошлому месяцу
    </>
  );
};

const PurchasesSkeleton = () => (
  <JournalSkeletonList>
    {Array.from({ length: 3 }, (_, index) => (
      <JournalSkeletonCard key={`purchases-skeleton-${index}`}>
        <SkeletonLine $width="38%" />
        <SkeletonLine $width="82%" />
        <SkeletonLine $height="32px" $width="100%" />
      </JournalSkeletonCard>
    ))}
  </JournalSkeletonList>
);

export const PurchasesWorkspace = ({
  appliedSearch,
  isDownloadingReport,
  isLoading,
  isSendingReport,
  monthValue,
  months,
  onClearSearch,
  onDownloadReport,
  onMonthChange,
  onRefresh,
  onResendEmail,
  onSearchInputChange,
  onSendReport,
  onSubmitSearch,
  previousSummary,
  products,
  purchases,
  reportStatus,
  resendingPaymentIntentId,
  searchInput,
  status,
  summary,
}: PurchasesWorkspaceProps) => {
  const isReportDisabled =
    !monthValue || isLoading || isSendingReport || isDownloadingReport;
  // A month with zero prior activity has nothing meaningful to compare against.
  const hasPreviousData = Boolean(
    previousSummary &&
    (previousSummary.salesCount > 0 ||
      previousSummary.plnTotalMinor > 0 ||
      previousSummary.eurTotalMinor > 0),
  );
  const maxProductSalesCount = products.reduce(
    (maxCount, product) => Math.max(maxCount, product.salesCount),
    0,
  );
  const settlementPending = Boolean(summary && summary.settledCount === 0);
  const settlementPartial = Boolean(
    summary && summary.settledCount > 0 && summary.settledCount < summary.salesCount,
  );

  return (
    <WorkspaceStack>
      <SurfaceCard>
        <SurfaceHeaderRow>
          <SurfaceTitle>Сводка за месяц</SurfaceTitle>
          <SurfaceHeaderActions>
            {months.length > 0 && (
              <HeaderSelectWrap>
                <Input
                  id="admin-purchases-month"
                  name="adminPurchasesMonth"
                  label="Месяц"
                  value={monthValue}
                  placeholder="Месяц"
                  selectOptions={months}
                  onChange={(event) => void onMonthChange(event.target.value)}
                  disabled={isLoading}
                  width="100%"
                />
              </HeaderSelectWrap>
            )}
            <IconActionButton
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              $isLoading={isLoading}
              aria-label="Обновить продажи"
              title="Обновить продажи"
            >
              {isLoading ? <LoaderCircle aria-hidden /> : <RefreshCw aria-hidden />}
            </IconActionButton>
          </SurfaceHeaderActions>
        </SurfaceHeaderRow>
        <SurfaceDescription>
          Успешные оплаты через Stripe; бесплатные ссылки из админки в выручку не
          попадают.
        </SurfaceDescription>

        {summary && (
          <StatStrip>
            <StatCell>
              <StatCellLabel>Выручка PLN</StatCellLabel>
              <StatCellValue $primary>{summary.plnTotalLabel}</StatCellValue>
              {hasPreviousData && previousSummary && (
                <StatCellMeta>
                  <MonthDelta
                    delta={summary.plnTotalMinor - previousSummary.plnTotalMinor}
                    formattedDelta={formatMinorDelta(
                      summary.plnTotalMinor - previousSummary.plnTotalMinor,
                      "pln",
                    )}
                  />
                </StatCellMeta>
              )}
            </StatCell>
            <StatCell>
              <StatCellLabel>Выручка EUR</StatCellLabel>
              <StatCellValue $primary>{summary.eurTotalLabel}</StatCellValue>
              {hasPreviousData && previousSummary && (
                <StatCellMeta>
                  <MonthDelta
                    delta={summary.eurTotalMinor - previousSummary.eurTotalMinor}
                    formattedDelta={formatMinorDelta(
                      summary.eurTotalMinor - previousSummary.eurTotalMinor,
                      "eur",
                    )}
                  />
                </StatCellMeta>
              )}
            </StatCell>
            <StatCell>
              <StatCellLabel>Успешных оплат</StatCellLabel>
              <StatCellValue>{summary.salesCount}</StatCellValue>
              {hasPreviousData && previousSummary && (
                <StatCellMeta>
                  <MonthDelta
                    delta={summary.salesCount - previousSummary.salesCount}
                    formattedDelta={`${
                      summary.salesCount > previousSummary.salesCount ? "+" : "−"
                    }${Math.abs(summary.salesCount - previousSummary.salesCount)}`}
                  />
                </StatCellMeta>
              )}
            </StatCell>
            <StatCell>
              <StatCellLabel>Чистыми после комиссии</StatCellLabel>
              <StatCellValue>
                {settlementPending ? "—" : summary.netTotalLabel}
              </StatCellValue>
              <StatCellMeta>
                {settlementPending
                  ? summary.salesCount > 0
                    ? "Stripe еще не отдал комиссию"
                    : "оплат нет"
                  : `комиссия: ${summary.feeTotalLabel}${
                      settlementPartial
                        ? ` · по ${summary.settledCount} из ${summary.salesCount}`
                        : ""
                    }`}
              </StatCellMeta>
            </StatCell>
            <StatCell>
              <StatCellLabel>Оплат не прошло</StatCellLabel>
              <StatCellValue>{summary.failedAttempts}</StatCellValue>
              <StatCellMeta>отклонена или отменена</StatCellMeta>
            </StatCell>
          </StatStrip>
        )}

        {products.length > 0 && (
          <>
            <SectionHeading>По продуктам</SectionHeading>
            <ProductBreakdownList>
              {products.map((product) => (
                <ProductBreakdownRow key={product.itemTitle}>
                  <ProductBreakdownHeader>
                    <ProductBreakdownName>{product.itemTitle}</ProductBreakdownName>
                    <ProductBreakdownNumbers>
                      {product.salesCount} шт
                      {product.amountLabels.length > 0
                        ? ` · ${product.amountLabels.join(" · ")}`
                        : ""}
                    </ProductBreakdownNumbers>
                  </ProductBreakdownHeader>
                  <ProductShareTrack>
                    <ProductShareFill
                      $percent={
                        maxProductSalesCount > 0
                          ? (product.salesCount / maxProductSalesCount) * 100
                          : 0
                      }
                    />
                  </ProductShareTrack>
                </ProductBreakdownRow>
              ))}
            </ProductBreakdownList>
          </>
        )}

        <CardFooterRow>
          <SalesProductMeta>
            Отчет за месяц — CSV по подтвержденным продажам
          </SalesProductMeta>
          <CardFooterActions>
            <Button
              buttonText={isDownloadingReport ? "Формирую..." : "Скачать CSV"}
              type="button"
              onClick={onDownloadReport}
              disabled={isReportDisabled}
              isLoading={isDownloadingReport}
              size="sm"
              variant="secondary"
              width="160px"
            />
            <Button
              buttonText={isSendingReport ? "Отправляю..." : "Отправить на почту"}
              type="button"
              onClick={onSendReport}
              disabled={isReportDisabled}
              isLoading={isSendingReport}
              size="sm"
              width="200px"
            />
          </CardFooterActions>
        </CardFooterRow>

        {reportStatus && (
          <StatusText $tone={reportStatus.tone}>{reportStatus.text}</StatusText>
        )}
        {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}
      </SurfaceCard>

      <SurfaceCard>
        <SurfaceHeaderRow>
          <SurfaceTitle>Покупки</SurfaceTitle>
        </SurfaceHeaderRow>
        <SurfaceDescription>
          {appliedSearch
            ? `Результаты поиска «${appliedSearch}» по всей истории продаж.`
            : "Покупки выбранного месяца, включая неуспешные. Поиск по имени, email, номеру инвойса или платежа — по всей истории."}
        </SurfaceDescription>

        <InlineSearchRow
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmitSearch();
          }}
        >
          <SearchFieldWrap>
            <Input
              id="admin-purchases-search"
              name="adminPurchasesSearch"
              label="Поиск покупателя"
              value={searchInput}
              placeholder="Имя, email, номер инвойса или платежа"
              onChange={(event) => onSearchInputChange(event.target.value)}
              disabled={isLoading}
              width="100%"
            />
          </SearchFieldWrap>
          <Button
            buttonText={isLoading ? "Ищу..." : "Найти"}
            type="submit"
            disabled={isLoading || (!searchInput.trim() && !appliedSearch)}
            isLoading={isLoading && Boolean(appliedSearch)}
            size="sm"
            width="120px"
          />
          {appliedSearch && (
            <Button
              buttonText="Показать месяц"
              type="button"
              onClick={onClearSearch}
              disabled={isLoading}
              size="sm"
              variant="secondary"
              width="160px"
            />
          )}
        </InlineSearchRow>

        {purchases.length > 0 && (
          <SalesProductMeta>
            Показано: {purchases.length}
            {purchases.length === PURCHASES_LIST_LIMIT
              ? " — это максимум списка, уточни поиском или месяцем"
              : ""}
          </SalesProductMeta>
        )}

        {purchases.length > 0 ? (
          <SalesTableWrap>
            <AdminDataTable aria-label="Список покупок">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Покупатель</th>
                  <th>Покупка</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => {
                  const outcomeMeta = OUTCOME_META[purchase.outcome];
                  const isResending =
                    resendingPaymentIntentId === purchase.paymentIntentId;

                  return (
                    <tr key={purchase.paymentIntentId}>
                      <td data-label="Дата">
                        {formatDateTime(purchase.soldAtIso, ACCOUNTING_TIME_ZONE)}
                      </td>
                      <td data-label="Покупатель">
                        <span>
                          <SalesProductName>
                            {purchase.customerName || "Без имени"}
                          </SalesProductName>
                          {purchase.customerEmail && (
                            <SalesProductMeta>{purchase.customerEmail}</SalesProductMeta>
                          )}
                        </span>
                      </td>
                      <td data-label="Покупка" title={purchase.paymentIntentId}>
                        <span>
                          <SalesProductName>
                            {purchase.purchaseItem || "—"}
                          </SalesProductName>
                          {purchase.invoiceNumber && (
                            <SalesProductMeta>
                              Инвойс: {purchase.invoiceNumber}
                            </SalesProductMeta>
                          )}
                        </span>
                      </td>
                      <td data-label="Сумма">
                        <SalesProductName>{purchase.amountLabel}</SalesProductName>
                      </td>
                      <td data-label="Статус">
                        <SalesStatusBadge $state={outcomeMeta.state}>
                          {outcomeMeta.label}
                        </SalesStatusBadge>
                      </td>
                      <td data-label="Действие">
                        {purchase.outcome === "succeeded" && (
                          <BroadcastActionButton
                            type="button"
                            onClick={() => onResendEmail(purchase.paymentIntentId)}
                            disabled={Boolean(resendingPaymentIntentId)}
                          >
                            {isResending ? (
                              <LoaderCircle aria-hidden />
                            ) : (
                              <Mail aria-hidden />
                            )}
                            {isResending ? "Отправляю..." : "Письмо еще раз"}
                          </BroadcastActionButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </AdminDataTable>
          </SalesTableWrap>
        ) : isLoading ? (
          <PurchasesSkeleton />
        ) : (
          <JournalEmptyState>
            {appliedSearch
              ? "По запросу ничего не нашлось. Проверь написание или поищи по части email."
              : "В выбранном месяце покупок пока нет."}
          </JournalEmptyState>
        )}
      </SurfaceCard>
    </WorkspaceStack>
  );
};
