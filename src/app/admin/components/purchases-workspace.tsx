import { CircleAlert, Download, Mail, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import styled from "styled-components";

import { ACCOUNTING_TIME_ZONE, getAccountingMonthValue } from "@/lib/accounting-month";
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
import { buildMonthComparison, formatDateTime } from "../lib/admin.utils";
import type { AdminTone } from "../styles/tokens.styles";
import { ConfirmDialog } from "../ui/feedback";
import { Checkbox, Input, Select, StatusLine } from "../ui/forms";
import {
  AdminButton,
  Badge,
  Callout,
  EmptyState,
  Muted,
  Panel,
  Row,
  Skeleton,
  Stack,
} from "../ui/primitives";
import { CellPrimary, CellSecondary, DataTable, TableScroller } from "../ui/table";

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
  onTerminalRecordedChange: (
    purchase: AdminPurchaseEntry,
    terminalRecorded: boolean,
  ) => void | Promise<void>;
  onSubmitSearch: () => void | Promise<void>;
  previousSummary: AdminPurchasesPreviousSummary | null;
  products: AdminProductBreakdownEntry[];
  purchases: AdminPurchaseEntry[];
  reportStatus: StatusMessage;
  resendingPaymentIntentId: string;
  searchInput: string;
  status: StatusMessage;
  summary: AdminPurchasesSummary | null;
  updatingTerminalPaymentIntentId: string;
};

const OUTCOME_META: Record<PurchaseOutcome, { label: string; tone: AdminTone }> = {
  canceled: { label: "Отменена", tone: "neutral" },
  failed: { label: "Не прошла", tone: "danger" },
  processing: { label: "В процессе", tone: "warning" },
  requires_action: { label: "Ждёт действия", tone: "warning" },
  succeeded: { label: "Оплачено", tone: "success" },
};

/** Six figures in even rows: 6 across, 3 on tablets, 2 on phones. */
const Metrics = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;

  @container admin-content (max-width: 1000px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @container admin-content (max-width: 520px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const Metric = styled.div`
  display: grid;
  align-content: start;
  gap: 4px;
  min-width: 0;
  padding: 12px 14px;
  border-radius: var(--a-radius);
  background: var(--a-surface-sunken);

  > span:first-child {
    color: var(--a-ink-2);
    font-size: var(--a-text-sm);
  }

  > b {
    font-size: var(--a-text-xl);
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  > small {
    color: var(--a-ink-3);
    font-size: var(--a-text-xs);
    line-height: 1.4;
  }
`;

const Breakdown = styled.ul`
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    gap: 6px;
  }

  [data-head] {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: var(--a-text-sm);
  }

  [data-head] span:first-child {
    min-width: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  [data-head] span:last-child {
    flex-shrink: 0;
    color: var(--a-ink-2);
    font-variant-numeric: tabular-nums;
  }

  [data-track] {
    height: 6px;
    border-radius: 999px;
    background: var(--a-surface-hover);
    overflow: hidden;
  }

  [data-fill] {
    height: 100%;
    border-radius: inherit;
    background: var(--a-accent);
  }
`;

const SubHeading = styled.h3`
  margin: 0;
  font-size: var(--a-text);
  font-weight: 650;
`;

const ReportBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  padding-top: 16px;
  border-top: 1px solid var(--a-border);
`;

const SearchForm = styled.form`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  > div {
    position: relative;
    flex: 1 1 260px;
    min-width: 0;
  }

  > div svg {
    position: absolute;
    left: 12px;
    top: 50%;
    width: 16px;
    height: 16px;
    color: var(--a-ink-3);
    transform: translateY(-50%);
    pointer-events: none;
  }

  > div input {
    padding-left: 36px;
  }

  @media (max-width: 640px) {
    > button {
      flex: 1 1 auto;
    }
  }
`;

const MonthSelect = styled(Select)`
  width: auto;
  min-width: 170px;
`;

const PurchaseRow = styled.tr<{ $polish: boolean }>`
  td:first-child {
    box-shadow: ${({ $polish }) => ($polish ? "inset 3px 0 0 var(--a-warning)" : "none")};
  }

  @container admin-content (max-width: 760px) {
    td:first-child {
      box-shadow: none;
    }

    border-left: ${({ $polish }) =>
      $polish ? "3px solid var(--a-warning) !important" : "1px solid var(--a-border)"};
  }
`;

// The running month is compared with the same days of the previous one (admin-sales).
const deltaText = (delta: number, formatted: string, isRunningMonth: boolean) =>
  delta === 0
    ? isRunningMonth
      ? "как за те же дни прошлого месяца"
      : "как в прошлом месяце"
    : `${formatted} ${isRunningMonth ? "к тем же дням прошлого месяца" : "к прошлому месяцу"}`;

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
  onTerminalRecordedChange,
  onSubmitSearch,
  previousSummary,
  products,
  purchases,
  reportStatus,
  resendingPaymentIntentId,
  searchInput,
  status,
  summary,
  updatingTerminalPaymentIntentId,
}: PurchasesWorkspaceProps) => {
  const [resendCandidate, setResendCandidate] = useState<AdminPurchaseEntry | null>(null);
  const isReportDisabled =
    !monthValue || isLoading || isSendingReport || isDownloadingReport;
  const isRunningMonth = monthValue === getAccountingMonthValue(new Date());
  const maxProductSalesCount = products.reduce(
    (maxCount, product) => Math.max(maxCount, product.salesCount),
    0,
  );
  const originalAmountLabel = summary
    ? [
        ...(summary.plnTotalMinor > 0 ? [summary.plnTotalLabel] : []),
        ...(summary.eurTotalMinor > 0 ? [summary.eurTotalLabel] : []),
      ].join(" · ") || "0 PLN"
    : "";
  const financialDataIncomplete = Boolean(
    summary && !summary.stripeFinancialDataComplete,
  );
  const { countDelta, grossDelta, netDelta } = buildMonthComparison({
    previousSummary,
    summary,
  });

  return (
    <Stack $gap={16}>
      <Panel
        title="Сводка за месяц"
        description="Только оплаты, подтверждённые Stripe. Суммы в злотых — как в отчёте; «Исходная стоимость» — сколько заплатил покупатель в своей валюте. Бесплатные доступы из админки не входят."
        actions={
          <>
            {months.length > 0 && (
              <MonthSelect
                aria-label="Месяц"
                value={monthValue}
                disabled={isLoading}
                onChange={(event) => void onMonthChange(event.target.value)}
              >
                {months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </MonthSelect>
            )}
            <AdminButton
              size="sm"
              icon={<RefreshCw aria-hidden />}
              loading={isLoading}
              onClick={() => void onRefresh()}
            >
              Обновить
            </AdminButton>
          </>
        }
      >
        <Stack $gap={18}>
          {summary ? (
            <Metrics>
              <Metric>
                <span>Оплачено покупателями</span>
                <b>{financialDataIncomplete ? "—" : summary.grossTotalLabel}</b>
                <small>
                  {grossDelta !== null
                    ? deltaText(
                        grossDelta,
                        formatMinorDelta(grossDelta, "pln"),
                        isRunningMonth,
                      )
                    : "до комиссии Stripe"}
                </small>
              </Metric>
              <Metric>
                <span>Комиссия Stripe</span>
                <b>{financialDataIncomplete ? "—" : summary.feeTotalLabel}</b>
                <small>удержано Stripe</small>
              </Metric>
              <Metric>
                <span>После комиссии</span>
                <b>{financialDataIncomplete ? "—" : summary.netTotalLabel}</b>
                <small>
                  {netDelta !== null
                    ? deltaText(
                        netDelta,
                        formatMinorDelta(netDelta, "pln"),
                        isRunningMonth,
                      )
                    : "на счёт"}
                </small>
              </Metric>
              <Metric>
                <span>Исходная стоимость</span>
                <b>{originalAmountLabel}</b>
                <small>в валюте покупателя</small>
              </Metric>
              <Metric>
                <span>Продаж в отчёте</span>
                <b>{summary.salesCount}</b>
                <small>
                  {summary.unconfirmedSalesCount > 0
                    ? `ещё ${summary.unconfirmedSalesCount} без подтверждения Stripe`
                    : countDelta !== null
                      ? deltaText(
                          countDelta,
                          `${countDelta > 0 ? "+" : "−"}${Math.abs(countDelta)}`,
                          isRunningMonth,
                        )
                      : "подтверждены Stripe"}
                </small>
              </Metric>
              <Metric>
                <span>Не прошло оплат</span>
                <b>{summary.failedAttempts}</b>
                <small>отказ банка или оплату бросили</small>
              </Metric>
            </Metrics>
          ) : (
            <Metrics>
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} $height={84} />
              ))}
            </Metrics>
          )}

          {summary && financialDataIncomplete && (
            <Callout tone="danger" icon={<CircleAlert aria-hidden />}>
              Итоги пока скрыты: Stripe ещё не прислал комиссию по части продаж (готово{" "}
              {summary.settledCount} из {summary.salesCount}). Отчёт можно будет скачать
              позже.
            </Callout>
          )}

          {products.length > 0 && (
            <Stack $gap={12}>
              <SubHeading>По продуктам · исходная стоимость</SubHeading>
              <Breakdown>
                {products.map((product) => (
                  <li key={product.itemTitle}>
                    <div data-head>
                      <span>{product.itemTitle}</span>
                      <span>
                        {product.salesCount} шт
                        {product.amountLabels.length > 0
                          ? ` · ${product.amountLabels.join(" · ")}`
                          : ""}
                      </span>
                    </div>
                    <div data-track>
                      <div
                        data-fill
                        style={{
                          width: `${
                            maxProductSalesCount > 0
                              ? (product.salesCount / maxProductSalesCount) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </Breakdown>
            </Stack>
          )}

          <ReportBar>
            <Muted>Отчёт за месяц — таблица подтверждённых продаж.</Muted>
            <Row $gap={8}>
              <AdminButton
                icon={<Download aria-hidden />}
                disabled={isReportDisabled}
                loading={isDownloadingReport}
                onClick={() => void onDownloadReport()}
              >
                Скачать CSV
              </AdminButton>
              <AdminButton
                variant="primary"
                icon={<Mail aria-hidden />}
                disabled={isReportDisabled}
                loading={isSendingReport}
                onClick={() => void onSendReport()}
              >
                Отправить на почту
              </AdminButton>
            </Row>
          </ReportBar>
          <StatusLine status={reportStatus} />
          <StatusLine status={status} />
        </Stack>
      </Panel>

      <Panel
        title={appliedSearch ? `Поиск: «${appliedSearch}»` : "Покупки"}
        description={
          appliedSearch
            ? "Результаты по всей истории продаж."
            : "Покупки выбранного месяца, включая неуспешные. Поиск ищет по всей истории."
        }
      >
        <Stack $gap={14}>
          <SearchForm
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmitSearch();
            }}
          >
            <div>
              <Search aria-hidden />
              <Input
                type="search"
                aria-label="Поиск покупателя"
                value={searchInput}
                placeholder="Имя, email, номер инвойса или платежа"
                disabled={isLoading}
                onChange={(event) => onSearchInputChange(event.target.value)}
              />
            </div>
            <AdminButton
              type="submit"
              variant="primary"
              disabled={isLoading || (!searchInput.trim() && !appliedSearch)}
              loading={isLoading && Boolean(appliedSearch)}
            >
              Найти
            </AdminButton>
            {appliedSearch && (
              <AdminButton disabled={isLoading} onClick={() => void onClearSearch()}>
                Показать месяц
              </AdminButton>
            )}
          </SearchForm>

          {purchases.length > 0 && (
            <Muted>
              Показано: {purchases.length}
              {purchases.length === PURCHASES_LIST_LIMIT
                ? " — это максимум списка, уточни поиском или месяцем"
                : ""}
            </Muted>
          )}

          {purchases.length > 0 ? (
            <TableScroller>
              <DataTable aria-label="Список покупок">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Имя</th>
                    <th>Покупка</th>
                    <th>Сумма</th>
                    <th>Статус</th>
                    <th>Касса</th>
                    <th aria-label="Действия" />
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => {
                    const outcome = OUTCOME_META[purchase.outcome];
                    const isResending =
                      resendingPaymentIntentId === purchase.paymentIntentId;
                    const isUpdatingTerminal =
                      updatingTerminalPaymentIntentId === purchase.paymentIntentId;
                    const isTerminalRecorded = Boolean(purchase.terminalRecordedAtIso);
                    const requiresTerminal =
                      purchase.isPolish && purchase.outcome === "succeeded";

                    return (
                      <PurchaseRow
                        key={purchase.paymentIntentId}
                        $polish={requiresTerminal && !isTerminalRecorded}
                      >
                        <td data-label="Дата">
                          {formatDateTime(purchase.soldAtIso, ACCOUNTING_TIME_ZONE)}
                        </td>
                        <td data-label="Имя">
                          <CellPrimary>
                            {purchase.customerName || "Без имени"}
                          </CellPrimary>
                          {purchase.customerEmail && (
                            <CellSecondary>{purchase.customerEmail}</CellSecondary>
                          )}
                        </td>
                        <td data-label="Покупка" title={purchase.paymentIntentId}>
                          <CellPrimary>{purchase.purchaseItem || "—"}</CellPrimary>
                          {purchase.invoiceNumber && (
                            <CellSecondary>Инвойс {purchase.invoiceNumber}</CellSecondary>
                          )}
                        </td>
                        <td data-label="Сумма">
                          <CellPrimary>{purchase.amountLabel}</CellPrimary>
                        </td>
                        <td data-label="Статус">
                          <Badge $tone={outcome.tone}>{outcome.label}</Badge>
                        </td>
                        <td data-label="Касса">
                          {requiresTerminal ? (
                            <Checkbox
                              checked={isTerminalRecorded}
                              disabled={Boolean(updatingTerminalPaymentIntentId)}
                              label={
                                isUpdatingTerminal
                                  ? "Сохраняю…"
                                  : isTerminalRecorded
                                    ? "Внесено"
                                    : "Внести в кассу"
                              }
                              description={
                                purchase.terminalRecordedAtIso
                                  ? formatDateTime(
                                      purchase.terminalRecordedAtIso,
                                      ACCOUNTING_TIME_ZONE,
                                    )
                                  : "Польская оплата"
                              }
                              onChange={(checked) =>
                                void onTerminalRecordedChange(purchase, checked)
                              }
                            />
                          ) : (
                            <Muted>—</Muted>
                          )}
                        </td>
                        <td data-actions>
                          {purchase.outcome === "succeeded" && (
                            <AdminButton
                              size="sm"
                              icon={<Mail aria-hidden />}
                              disabled={Boolean(resendingPaymentIntentId)}
                              loading={isResending}
                              onClick={() => setResendCandidate(purchase)}
                            >
                              Письмо ещё раз
                            </AdminButton>
                          )}
                        </td>
                      </PurchaseRow>
                    );
                  })}
                </tbody>
              </DataTable>
            </TableScroller>
          ) : isLoading ? (
            <Stack $gap={8}>
              <Skeleton $height={48} />
              <Skeleton $height={48} />
              <Skeleton $height={48} />
            </Stack>
          ) : (
            <EmptyState
              title={
                appliedSearch ? "Ничего не нашлось" : "В этом месяце покупок пока нет"
              }
              text={
                appliedSearch ? "Проверь написание или поищи по части email." : undefined
              }
            />
          )}
        </Stack>
      </Panel>

      <ConfirmDialog
        open={resendCandidate !== null}
        title="Отправить письмо ещё раз?"
        description={`Отправить письмо о покупке ещё раз на ${resendCandidate?.customerEmail || "почту покупателя"}?`}
        confirmLabel="Отправить"
        onCancel={() => setResendCandidate(null)}
        onConfirm={() => {
          const paymentIntentId = resendCandidate?.paymentIntentId ?? "";
          setResendCandidate(null);
          void onResendEmail(paymentIntentId);
        }}
      />
    </Stack>
  );
};
