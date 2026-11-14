import { LoaderCircle, RefreshCw } from "lucide-react";

import { CHOREO_CATALOGUE_PRODUCT_CODES } from "@/constants/sellable-products";

import type {
  SalesProductEntry,
  SalesProductOffer,
  StatusMessage,
} from "../lib/admin.types";
import {
  IconActionButton,
  JournalEmptyState,
  JournalSkeletonCard,
  JournalSkeletonList,
  SalesArchive,
  SalesOfferList,
  SalesProductMeta,
  SalesProductName,
  SalesStatusBadge,
  SalesTable,
  SalesTableWrap,
  SalesToggle,
  SalesToggleCell,
  SalesToggleHint,
  SalesToggleLabel,
  SalesWorkspaceLayout,
  SkeletonLine,
  StatusText,
  SurfaceCard,
  SurfaceDescription,
  SurfaceHeaderRow,
  SurfaceTitle,
} from "../page.styles";

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

// A product that needs an active cycle cannot be opened without one, but it can
// always be closed - the switch never traps sales in the "on" position.
const isBlockedByMissingCampaign = (product: SalesProductEntry) =>
  product.requiresActiveCampaign && !product.hasActiveCampaign;

const getStatusBadge = (product: SalesProductEntry) => {
  if (product.missingLessonLanguages.length > 0) {
    return { label: "Нужны каналы", state: "blocked" as const };
  }

  if (product.salesEnabled && product.offers.some((offer) => offer.salesEnabled)) {
    return { label: "Продается", state: "open" as const };
  }

  if (product.salesEnabled) {
    return { label: "Тарифы выключены", state: "closed" as const };
  }

  if (isBlockedByMissingCampaign(product)) {
    return { label: "Нужен поток", state: "blocked" as const };
  }

  return { label: "Закрыто", state: "closed" as const };
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
  onToggle,
  products,
  updatingProductId,
  label = "Доступность продаж по продуктам",
}: Pick<
  SalesWorkspaceProps,
  "activeCampaignTitle" | "onToggle" | "products" | "updatingProductId"
> & { label?: string }) => (
  <SalesTableWrap>
    <SalesTable aria-label={label}>
      <thead>
        <tr>
          <th>Продукт</th>
          <th>Тарифы</th>
          <th>Статус</th>
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
            <tr key={product.productId}>
              <td data-label="Продукт">
                <span>
                  <SalesProductName>{product.title}</SalesProductName>
                  <SalesProductMeta>{PRODUCT_TYPE_LABELS[product.type]}</SalesProductMeta>
                  {campaignMeta && <SalesProductMeta>{campaignMeta}</SalesProductMeta>}
                </span>
              </td>
              <td data-label="Тарифы">
                <SalesOfferList>
                  {product.offers.map((offer) => (
                    <li key={offer.offerId}>
                      <span>
                        {/* A lone tariff has no name worth showing: it is just the price. */}
                        <span>{product.offers.length > 1 ? offer.label : "Цена"}</span>
                        <strong>{offer.price}</strong>
                      </span>
                      {product.type === "choreo" && (
                        <SalesToggleCell>
                          <SalesToggle
                            type="button"
                            role="switch"
                            aria-checked={offer.salesEnabled}
                            aria-label={`Тариф «${offer.label}» — «${product.title}»`}
                            $isOn={offer.salesEnabled}
                            disabled={Boolean(updatingProductId)}
                            onClick={() => onToggle(product, offer)}
                          />
                          <SalesToggleLabel $isOn={offer.salesEnabled}>
                            {offer.salesEnabled ? "Включён" : "Выключен"}
                          </SalesToggleLabel>
                        </SalesToggleCell>
                      )}
                    </li>
                  ))}
                </SalesOfferList>
              </td>
              <td data-label="Статус">
                <SalesStatusBadge $state={badge.state}>{badge.label}</SalesStatusBadge>
              </td>
              <td data-label="Продажи">
                <SalesToggleCell>
                  <SalesToggle
                    type="button"
                    role="switch"
                    aria-checked={product.salesEnabled}
                    aria-label={`Продажи «${product.title}»`}
                    $isOn={product.salesEnabled}
                    disabled={isToggleDisabled}
                    onClick={() => onToggle(product)}
                  />
                  <SalesToggleLabel $isOn={product.salesEnabled}>
                    {isUpdating
                      ? "Сохраняю..."
                      : product.salesEnabled
                        ? "Включены"
                        : "Выключены"}
                  </SalesToggleLabel>
                </SalesToggleCell>
                {product.type === "choreo" && !product.salesEnabled && (
                  <SalesProductMeta>Тарифы сохранены; продажи на паузе.</SalesProductMeta>
                )}
                {product.salesEnabled &&
                  !product.offers.some((offer) => offer.salesEnabled) && (
                    <SalesToggleHint>
                      Включи хотя бы один тариф для покупки.
                    </SalesToggleHint>
                  )}
                {product.missingLessonLanguages.length > 0 && (
                  <SalesToggleHint>
                    Настрой Telegram-каналы:{" "}
                    {product.missingLessonLanguages
                      .map((language) => language.toUpperCase())
                      .join(", ")}
                    .
                  </SalesToggleHint>
                )}
                {isBlocked && !product.salesEnabled && (
                  <SalesToggleHint>
                    Запусти поток в разделе Online Group — без него оплату завершить
                    нельзя.
                  </SalesToggleHint>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </SalesTable>
  </SalesTableWrap>
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
  const isCurrentChoreo = (product: SalesProductEntry) =>
    CHOREO_CATALOGUE_PRODUCT_CODES.some((code) => code === product.code);
  const currentProducts = products
    .filter((product) => product.type !== "choreo" || isCurrentChoreo(product))
    .sort(
      (left, right) => Number(isCurrentChoreo(right)) - Number(isCurrentChoreo(left)),
    );
  const otherChoreos = products.filter(
    (product) => product.type === "choreo" && !isCurrentChoreo(product),
  );

  return (
    <SalesWorkspaceLayout>
      <SurfaceCard>
        <SurfaceHeaderRow>
          <SurfaceTitle>Доступность продаж</SurfaceTitle>
          <IconActionButton
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            $isLoading={isLoading}
            aria-label="Обновить состояние продаж"
            title="Обновить состояние продаж"
          >
            {isLoading ? <LoaderCircle aria-hidden /> : <RefreshCw aria-hidden />}
          </IconActionButton>
        </SurfaceHeaderRow>
        <SurfaceDescription>
          Включи продажи продукта и выбери доступные тарифы. Общий переключатель ставит
          продажи на паузу, сохраняя выбор тарифов и доступы покупателей.
        </SurfaceDescription>

        {products.length > 0 ? (
          <>
            <SalesProductsTable
              activeCampaignTitle={activeCampaignTitle}
              products={currentProducts}
              onToggle={onToggle}
              updatingProductId={updatingProductId}
            />
            {otherChoreos.length > 0 && (
              <SalesArchive>
                <summary>
                  Другие разборы <span>{otherChoreos.length}</span>
                </summary>
                <p>Скрыты в каталоге сайта. Прежние покупки и доступы сохранены.</p>
                <SalesProductsTable
                  activeCampaignTitle={activeCampaignTitle}
                  products={otherChoreos}
                  onToggle={onToggle}
                  updatingProductId={updatingProductId}
                  label="Другие разборы"
                />
              </SalesArchive>
            )}
          </>
        ) : isLoading ? (
          <JournalSkeletonList>
            {Array.from({ length: 3 }, (_, index) => (
              <JournalSkeletonCard key={`sales-skeleton-${index}`}>
                <SkeletonLine $width="46%" />
                <SkeletonLine $width="72%" />
                <SkeletonLine $height="32px" $width="100%" />
              </JournalSkeletonCard>
            ))}
          </JournalSkeletonList>
        ) : status?.tone === "error" ? null : (
          // A failed load already says so below; claiming the catalogue is empty on
          // top of it would be a second, wrong explanation.
          <JournalEmptyState>Каталог пуст — нечего показывать.</JournalEmptyState>
        )}

        {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}
      </SurfaceCard>
    </SalesWorkspaceLayout>
  );
};
