import { LoaderCircle, RefreshCw } from "lucide-react";
import type { FormEvent } from "react";

import Button from "@/components/common/Button";
import Input from "@/components/common/Input";

import { JOURNAL_SKELETON_COUNT } from "../lib/admin.constants";
import type {
  GeneratedLinkEntry,
  GeneratorKind,
  SelectOption,
  StatusMessage,
} from "../lib/admin.types";
import { formatDateTime, resolveLinkStateLabel } from "../lib/admin.utils";
import {
  ButtonRow,
  Form,
  FormControl,
  IconActionButton,
  JournalEmptyState,
  JournalSkeletonCard,
  JournalSkeletonList,
  LinkStateBadge,
  RecentLinkCard,
  RecentLinkHeader,
  RecentLinkMeta,
  RecentLinksList,
  SkeletonLine,
  StatusText,
  SurfaceCard,
  SurfaceHeaderRow,
  SurfaceTitle,
} from "../page.styles";
import { CopyableLink } from "./copyable-link";

type InviteLinkGeneratorCardProps = {
  adminLabel: string;
  choreoSelectOptions: SelectOption[];
  copyingUrl: string;
  generatedLink: string;
  generatorStatus: StatusMessage;
  isGenerateDisabled: boolean;
  isGenerating: boolean;
  kind: GeneratorKind;
  kindSelectOptions: SelectOption[];
  onAdminLabelChange: (value: string) => void;
  onChoreoSelectionChange: (value: string) => void;
  onCopy: (link: string) => void | Promise<void>;
  onKindChange: (kind: GeneratorKind) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  selectedChoreoKey: string;
};

export const InviteLinkGeneratorCard = ({
  adminLabel,
  choreoSelectOptions,
  copyingUrl,
  generatedLink,
  generatorStatus,
  isGenerateDisabled,
  isGenerating,
  kind,
  kindSelectOptions,
  onAdminLabelChange,
  onChoreoSelectionChange,
  onCopy,
  onKindChange,
  onSubmit,
  selectedChoreoKey,
}: InviteLinkGeneratorCardProps) => (
  <SurfaceCard>
    <SurfaceTitle>Генератор доступа</SurfaceTitle>
    <Form onSubmit={onSubmit}>
      <FormControl>
        <Input
          id="generator-kind"
          name="generatorKind"
          label="Что генерируем"
          value={kind}
          onChange={(event) => onKindChange(event.target.value as GeneratorKind)}
          selectOptions={kindSelectOptions}
          width="100%"
        />
      </FormControl>

      {kind === "choreo" && (
        <FormControl>
          <Input
            id="choreo-selection"
            name="choreoSelection"
            label="Разбор / язык / тип"
            value={selectedChoreoKey}
            placeholder="Выбери нужный разбор"
            selectOptions={choreoSelectOptions}
            onChange={(event) => onChoreoSelectionChange(event.target.value)}
            width="100%"
          />
        </FormControl>
      )}

      <FormControl>
        <Input
          id="admin-link-label"
          name="adminLinkLabel"
          label="Идентификатор"
          value={adminLabel}
          placeholder="Например: Аня / спец-оффер / блогер"
          onChange={(event) => onAdminLabelChange(event.target.value)}
          width="100%"
        />
      </FormControl>

      <ButtonRow>
        <Button
          buttonText={isGenerating ? "Генерирую..." : "Сгенерировать ссылку"}
          type="submit"
          disabled={isGenerateDisabled}
          isLoading={isGenerating}
          width="100%"
        />
      </ButtonRow>

      {generatorStatus && (
        <StatusText $tone={generatorStatus.tone}>{generatorStatus.text}</StatusText>
      )}

      {generatedLink && (
        <CopyableLink
          isCopying={copyingUrl === generatedLink}
          link={generatedLink}
          onCopy={onCopy}
        />
      )}
    </Form>
  </SurfaceCard>
);

type InviteLinkJournalCardProps = {
  copyingUrl: string;
  isInitialLoading: boolean;
  isLoading: boolean;
  links: GeneratedLinkEntry[];
  onCopy: (link: string) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
};

export const InviteLinkJournalCard = ({
  copyingUrl,
  isInitialLoading,
  isLoading,
  links,
  onCopy,
  onRefresh,
}: InviteLinkJournalCardProps) => (
  <SurfaceCard>
    <SurfaceHeaderRow>
      <SurfaceTitle>Журнал последних ссылок</SurfaceTitle>
      <IconActionButton
        type="button"
        onClick={onRefresh}
        disabled={isLoading}
        $isLoading={isLoading}
        aria-label="Обновить журнал"
        title="Обновить журнал"
      >
        {isLoading ? <LoaderCircle aria-hidden /> : <RefreshCw aria-hidden />}
      </IconActionButton>
    </SurfaceHeaderRow>
    {isInitialLoading ? (
      <JournalSkeletonList>
        {Array.from({ length: JOURNAL_SKELETON_COUNT }, (_, index) => (
          <JournalSkeletonCard key={`journal-skeleton-${index}`}>
            <SkeletonLine $width="58%" />
            <SkeletonLine $width="36%" />
            <SkeletonLine $width="100%" $height="36px" />
          </JournalSkeletonCard>
        ))}
      </JournalSkeletonList>
    ) : links.length === 0 ? (
      <JournalEmptyState>Созданных администратором ссылок нет.</JournalEmptyState>
    ) : (
      <RecentLinksList>
        {links.map((entry) => (
          <RecentLinkCard key={`${entry.accessUrl}-${entry.createdAtIso}`}>
            <RecentLinkHeader>
              <RecentLinkMeta>{entry.selectionLabel}</RecentLinkMeta>
              <LinkStateBadge $state={entry.linkState}>
                {resolveLinkStateLabel(entry.linkState)}
              </LinkStateBadge>
            </RecentLinkHeader>

            <RecentLinkMeta>Идентификатор: {entry.adminLabel || "-"}</RecentLinkMeta>
            <RecentLinkMeta>
              Создано: {formatDateTime(entry.createdAtIso)} | Токен до:{" "}
              {entry.tokenExpiresAt
                ? formatDateTime(entry.tokenExpiresAt)
                : "не определено"}
            </RecentLinkMeta>

            <CopyableLink
              isCopying={copyingUrl === entry.accessUrl}
              link={entry.accessUrl}
              onCopy={onCopy}
            />
          </RecentLinkCard>
        ))}
      </RecentLinksList>
    )}
  </SurfaceCard>
);
