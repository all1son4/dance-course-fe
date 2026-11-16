import { ChevronRight, RefreshCw, Store } from "lucide-react";
import { useState } from "react";

import { CHOREO_CATALOGUE_PRODUCT_CODES } from "@/constants/sellable-products";

import type {
  SalesProductEntry,
  SalesProductOffer,
  StatusMessage,
} from "../lib/admin.types";
import {
  CatalogArchive,
  CatalogTable,
  OfferList,
  SalesControl,
  SalesHint,
  SalesNote,
} from "../styles/catalog.styles";
import type { AdminTone } from "../styles/tokens.styles";
import { ConfirmDialog } from "../ui/feedback";
import { Checkbox, StatusLine, Switch } from "../ui/forms";
import {
  AdminButton,
  Badge,
  EmptyState,
  Muted,
  Panel,
  Row,
  Skeleton,
  Stack,
} from "../ui/primitives";
import { CellPrimary, CellSecondary, TableScroller } from "../ui/table";

type SalesWorkspaceProps = {
  activeCampaignTitle: string;
  isLoading: boolean;
  onRefresh: () => void | Promise<void>;
  onToggle: (
    product: SalesProductEntry,
    offer?: SalesProductOffer,
  ) => void | Promise<void>;
  products: SalesProductEntry[];
  status: StatusMessage;
  updatingProductId: string;
};

const PRODUCT_TYPE_LABELS: Record<SalesProductEntry["type"], string> = {
  choreo: "Разбор",
  course: "Курс",
};

/** What a product is to Anna: the catalogue type alone calls the group and the library «курс». */
const PRODUCT_KIND_BY_CODE: Record<string, string> = {
  "inspiration-hub": "Библиотека",
  "online-group-anna-strok": "Онлайн-группа",
};

const productKind = (product: SalesProductEntry) =>
  PRODUCT_KIND_BY_CODE[product.code] ?? PRODUCT_TYPE_LABELS[product.type];

// A product that needs an active cycle cannot be opened without one, but it can
// always be closed - the switch never traps sales in the "on" position.
const isBlockedByMissingCampaign = (product: SalesProductEntry) =>
  product.requiresActiveCampaign && !product.hasActiveCampaign;

const getStatusBadge = (
  product: SalesProductEntry,
): { label: string; tone: AdminTone } => {
  if (product.missingLessonLanguages.length > 0) {
    return { label: "Нужны каналы", tone: "warning" };
  }

  if (product.salesEnabled && product.offers.some((offer) => offer.salesEnabled)) {
    return { label: "Продаётся", tone: "success" };
  }

  if (product.salesEnabled) {
    return { label: "Тарифы выключены", tone: "warning" };
  }

  if (isBlockedByMissingCampaign(product)) {
    return { label: "Нужен поток", tone: "warning" };
  }

  return { label: "Закрыто", tone: "neutral" };
};

const getCampaignMeta = (product: SalesProductEntry, activeCampaignTitle: string) => {
  if (!product.requiresActiveCampaign) {
    return "";
  }

  return product.hasActiveCampaign
    ? `Активный поток: ${activeCampaignTitle || "без названия"}`
    : product.campaignIssue || "Поток не запущен";
};

const SalesProductsTable = ({
  activeCampaignTitle,
  label,
  movedId,
  onSwitch,
  onToggle,
  products,
  updatingProductId,
}: Pick<
  SalesWorkspaceProps,
  "activeCampaignTitle" | "onToggle" | "products" | "updatingProductId"
> & {
  label: string;
  movedId: string;
  onSwitch: (product: SalesProductEntry) => void;
}) => (
  <TableScroller>
    <CatalogTable aria-label={label}>
      <thead>
        <tr>
          <th>Продукт</th>
          <th>Тарифы</th>
          <th>Продажи</th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => {
          const badge = getStatusBadge(product);
          const campaignMeta = getCampaignMeta(product, activeCampaignTitle);
          const isBlocked = isBlockedByMissingCampaign(product);
          const isUpdating = updatingProductId === product.productId;
          const isToggleDisabled =
            Boolean(updatingProductId) ||
            ((isBlocked || product.missingLessonLanguages.length > 0) &&
              !product.salesEnabled);

          return (
            <tr
              key={product.productId}
              data-moved={movedId === product.productId || undefined}
            >
              <td data-label="Продукт">
                <span>
                  <CellPrimary>{product.title}</CellPrimary>
                  <CellSecondary>{productKind(product)}</CellSecondary>
                  {campaignMeta && <CellSecondary>{campaignMeta}</CellSecondary>}
                </span>
              </td>
              <td data-label="Тарифы">
                <OfferList>
                  {product.offers.map((offer) => (
                    <li key={offer.offerId}>
                      {product.type === "choreo" ? (
                        <Checkbox
                          checked={offer.salesEnabled}
                          disabled={Boolean(updatingProductId)}
                          label={offer.label}
                          onChange={() => void onToggle(product, offer)}
                        />
                      ) : (
                        // A lone tariff has no name worth showing: it is just the price.
                        <span>{product.offers.length > 1 ? offer.label : "Цена"}</span>
                      )}
                      <strong>{offer.price}</strong>
                    </li>
                  ))}
                </OfferList>
              </td>
              <td data-label="Продажи">
                <SalesControl>
                  <Row $gap={10} $wrap={false}>
                    <Switch
                      checked={product.salesEnabled}
                      disabled={isToggleDisabled}
                      label={`Продажи «${product.title}»`}
                      onChange={() => onSwitch(product)}
                    />
                    {isUpdating ? (
                      <Muted>Сохраняю…</Muted>
                    ) : (
                      <Badge $tone={badge.tone}>{badge.label}</Badge>
                    )}
                  </Row>
                  {product.type === "choreo" && !product.salesEnabled && (
                    <SalesNote>Тарифы сохранены; продажи на паузе.</SalesNote>
                  )}
                  {product.salesEnabled &&
                    !product.offers.some((offer) => offer.salesEnabled) && (
                      <SalesHint>Включи хотя бы один тариф для покупки.</SalesHint>
                    )}
                  {product.missingLessonLanguages.length > 0 && (
                    <SalesHint>
                      Не подключены Telegram-каналы разбора (
                      {product.missingLessonLanguages
                        .map((language) => language.toUpperCase())
                        .join(", ")}
                      ). Их подключает разработчик.
                    </SalesHint>
                  )}
                  {isBlocked && !product.salesEnabled && (
                    <SalesHint>
                      Нет текущего потока: оплату не завершить. Открой Online Group →
                      «Потоки».
                    </SalesHint>
                  )}
                </SalesControl>
              </td>
            </tr>
          );
        })}
      </tbody>
    </CatalogTable>
  </TableScroller>
);

export const SalesWorkspace = ({
  activeCampaignTitle,
  isLoading,
  onRefresh,
  onToggle,
  products,
  status,
  updatingProductId,
}: SalesWorkspaceProps) => {
  const [showClosed, setShowClosed] = useState(false);
  // The product whose switch was flipped last and what it was before: once the
  // saved state differs, it has moved to the other group.
  const [lastSwitched, setLastSwitched] = useState<{ id: string; wasOn: boolean } | null>(
    null,
  );

  const isCurrentChoreo = (product: SalesProductEntry) =>
    CHOREO_CATALOGUE_PRODUCT_CODES.some((code) => code === product.code);
  // Courses and the choreos on the site's catalogue first, older choreos after.
  const ordered = [...products].sort(
    (left, right) =>
      Number(left.type === "choreo" && !isCurrentChoreo(left)) -
      Number(right.type === "choreo" && !isCurrentChoreo(right)),
  );
  const onSale = ordered.filter((product) => product.salesEnabled);
  const closed = ordered.filter((product) => !product.salesEnabled);

  const moved = lastSwitched
    ? products.find(
        (product) =>
          product.productId === lastSwitched.id &&
          product.salesEnabled !== lastSwitched.wasOn,
      )
    : undefined;
  const movedId = moved?.productId ?? "";

  // Switching sales off stops purchases at once (for the Online Group also through
  // renewal links), so it asks first; switching on does not.
  const [closing, setClosing] = useState<SalesProductEntry | null>(null);

  const applySwitch = (product: SalesProductEntry) => {
    setLastSwitched({ id: product.productId, wasOn: product.salesEnabled });
    void onToggle(product);
  };

  const switchProduct = (product: SalesProductEntry) => {
    if (product.salesEnabled) setClosing(product);
    else applySwitch(product);
  };

  const tableProps = {
    activeCampaignTitle,
    movedId,
    onSwitch: switchProduct,
    onToggle,
    updatingProductId,
  };

  return (
    <Panel
      title="Что продаётся на сайте"
      description="Включённые продукты — сверху, выключенные свёрнуты ниже. Переключатель переносит продукт между группами."
      actions={
        <AdminButton
          size="sm"
          icon={<RefreshCw aria-hidden />}
          loading={isLoading}
          onClick={() => void onRefresh()}
        >
          Обновить
        </AdminButton>
      }
    >
      <Stack $gap={16}>
        {products.length > 0 ? (
          <>
            {onSale.length > 0 ? (
              <SalesProductsTable
                {...tableProps}
                label="Сейчас продаются"
                products={onSale}
              />
            ) : (
              <EmptyState
                icon={<Store aria-hidden />}
                title="Сейчас ничего не продаётся"
                text="Включи продукт в группе «Выключены»."
              />
            )}

            {moved && !moved.salesEnabled && !showClosed && (
              <Row $gap={8}>
                <Muted>{moved.title} — выключен и перенесён в «Выключены».</Muted>
                <AdminButton
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowClosed(true)}
                >
                  Показать
                </AdminButton>
              </Row>
            )}

            {closed.length > 0 && (
              <CatalogArchive
                open={showClosed}
                onToggle={(event) => setShowClosed(event.currentTarget.open)}
              >
                <summary>
                  <ChevronRight aria-hidden />
                  Выключены
                  <Badge>{closed.length}</Badge>
                </summary>
                <p>Не продаются на сайте. Прежние покупки и доступы сохранены.</p>
                <SalesProductsTable {...tableProps} label="Выключены" products={closed} />
              </CatalogArchive>
            )}
          </>
        ) : isLoading ? (
          <Stack $gap={10}>
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={`sales-skeleton-${index}`} $height={56} />
            ))}
          </Stack>
        ) : status?.tone === "error" ? null : (
          // A failed load already says so below; claiming the catalogue is empty on
          // top of it would be a second, wrong explanation.
          <EmptyState
            icon={<Store aria-hidden />}
            title="Продукты не загрузились"
            text="Нажми «Обновить»; если снова пусто — напиши разработчику."
          />
        )}

        <StatusLine status={status} />
      </Stack>
      <ConfirmDialog
        open={closing !== null}
        title={closing ? `Выключить продажи «${closing.title}»?` : ""}
        description={
          closing?.code === "online-group-anna-strok"
            ? "Купить на сайте и по прямым ссылкам станет нельзя, ссылки продления тоже перестанут открывать оплату. Доступы прежних покупателей не изменятся."
            : "Купить на сайте и по прямым ссылкам станет нельзя. Доступы прежних покупателей не изменятся."
        }
        confirmLabel="Выключить"
        tone="danger"
        onCancel={() => setClosing(null)}
        onConfirm={() => {
          if (closing) applySwitch(closing);
          setClosing(null);
        }}
      />
    </Panel>
  );
};
