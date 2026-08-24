import { LoaderCircle, RefreshCw } from "lucide-react";

import type { SalesProductEntry, StatusMessage } from "../lib/admin.types";
import {
  IconActionButton,
  JournalEmptyState,
  JournalSkeletonCard,
  JournalSkeletonList,
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
  onToggle: (product: SalesProductEntry) => void | Promise<void>;
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
  if (product.salesEnabled) {
    return { label: "Продается", state: "open" as const };
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
    : "Поток не запущен";
};

export const SalesWorkspace = ({
  activeCampaignTitle,
  isLoading,
  onRefresh,
  onToggle,
  products,
  status,
  updatingProductId,
}: SalesWorkspaceProps) => (
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
        Выключенный продукт остается на сайте вместе с ценами, но кнопки покупки
        пропадают, а оплата не пройдет даже по прямой ссылке или из старого письма.
      </SurfaceDescription>

      {products.length > 0 ? (
        <SalesTableWrap>
          <SalesTable aria-label="Доступность продаж по продуктам">
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
                  Boolean(updatingProductId) || (isBlocked && !product.salesEnabled);

                return (
                  <tr key={product.productId}>
                    <td data-label="Продукт">
                      <span>
                        <SalesProductName>{product.title}</SalesProductName>
                        <SalesProductMeta>
                          {PRODUCT_TYPE_LABELS[product.type]}
                        </SalesProductMeta>
                        {campaignMeta && (
                          <SalesProductMeta>{campaignMeta}</SalesProductMeta>
                        )}
                      </span>
                    </td>
                    <td data-label="Тарифы">
                      <SalesOfferList>
                        {product.offers.map((offer) => (
                          <li key={offer.offerId}>
                            <span>{offer.label}</span>
                            <span>{offer.price}</span>
                          </li>
                        ))}
                      </SalesOfferList>
                    </td>
                    <td data-label="Статус">
                      <SalesStatusBadge $state={badge.state}>
                        {badge.label}
                      </SalesStatusBadge>
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
