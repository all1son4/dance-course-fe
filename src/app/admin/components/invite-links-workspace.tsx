import { Archive, ArchiveRestore, Link2, RefreshCw } from "lucide-react";
import { type FormEvent, useState } from "react";
import styled from "styled-components";

import { JOURNAL_SKELETON_COUNT } from "../lib/admin.constants";
import type {
  GeneratedLinkEntry,
  GeneratorKind,
  SelectOption,
  StatusMessage,
} from "../lib/admin.types";
import { formatDateTime, resolveLinkStateLabel } from "../lib/admin.utils";
import { CopyField } from "../ui/copy";
import { Field, FormActions, Input, Select, StatusLine } from "../ui/forms";
import {
  AdminButton,
  Badge,
  Disclosure,
  EmptyState,
  FieldNote,
  Muted,
  Panel,
  Skeleton,
  Stack,
  TextButton,
} from "../ui/primitives";

const GeneratorForm = styled.form`
  display: grid;
  gap: 14px;
`;

const EntryMeta = styled(Muted)`
  font-size: var(--a-text-sm);
  overflow-wrap: anywhere;
`;

type InviteLinkGeneratorCardProps = {
  adminLabel: string;
  choreoSelectOptions: SelectOption[];
  generatedLink: string;
  generatorStatus: StatusMessage;
  isGenerateDisabled: boolean;
  isGenerating: boolean;
  kind: GeneratorKind;
  kindSelectOptions: SelectOption[];
  onAdminLabelChange: (value: string) => void;
  onChoreoSelectionChange: (value: string) => void;
  onKindChange: (kind: GeneratorKind) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  selectedChoreoKey: string;
};

export const InviteLinkGeneratorCard = ({
  adminLabel,
  choreoSelectOptions,
  generatedLink,
  generatorStatus,
  isGenerateDisabled,
  isGenerating,
  kind,
  kindSelectOptions,
  onAdminLabelChange,
  onChoreoSelectionChange,
  onKindChange,
  onSubmit,
  selectedChoreoKey,
}: InviteLinkGeneratorCardProps) => (
  <Panel
    title="Бесплатный доступ"
    description="Доступ в Online Group и библиотеку для Plus — в разделе Online Group → «Приглашения»."
  >
    <GeneratorForm onSubmit={onSubmit}>
      <Field label="К чему доступ" htmlFor="generator-kind">
        <Select
          id="generator-kind"
          name="generatorKind"
          value={kind}
          onChange={(event) => onKindChange(event.target.value as GeneratorKind)}
        >
          {kindSelectOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      {kind === "choreo" && (
        <Field label="Разбор / язык / тип" htmlFor="choreo-selection">
          <Select
            id="choreo-selection"
            name="choreoSelection"
            value={selectedChoreoKey}
            onChange={(event) => onChoreoSelectionChange(event.target.value)}
          >
            <option value="" disabled hidden>
              Выбери нужный разбор
            </option>
            {choreoSelectOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field
        label="Для кого"
        htmlFor="admin-link-label"
        hint="Имя, ник или почта — чтобы потом найти в журнале"
      >
        <Input
          id="admin-link-label"
          name="adminLinkLabel"
          value={adminLabel}
          placeholder="Например: Аня или @anna"
          onChange={(event) => onAdminLabelChange(event.target.value)}
        />
      </Field>

      <FormActions>
        <AdminButton
          type="submit"
          variant="primary"
          icon={<Link2 aria-hidden />}
          disabled={isGenerateDisabled}
          loading={isGenerating}
        >
          {isGenerating ? "Создаю…" : "Создать ссылку"}
        </AdminButton>
      </FormActions>

      <StatusLine status={generatorStatus} />

      {generatedLink && <CopyField label="Ссылка" value={generatedLink} />}
    </GeneratorForm>
  </Panel>
);

type InviteLinkJournalCardProps = {
  isInitialLoading: boolean;
  isLoading: boolean;
  links: GeneratedLinkEntry[];
  onArchive: (purchaseId: string, archived: boolean) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
};

const LINK_STATE_TONE = {
  active: "success",
  expired: "warning",
  used: "neutral",
} as const;

const LinkEntry = ({
  entry,
  onArchive,
}: {
  entry: GeneratedLinkEntry;
  onArchive: InviteLinkJournalCardProps["onArchive"];
}) => {
  const until = entry.tokenExpiresAt ? formatDateTime(entry.tokenExpiresAt) : "";

  return (
    <Disclosure
      title={entry.adminLabel || "Без имени"}
      hint={`${entry.selectionLabel} · создана ${formatDateTime(entry.createdAtIso)}`}
      aside={
        <>
          <Badge $tone={LINK_STATE_TONE[entry.linkState]}>
            {resolveLinkStateLabel(entry.linkState)}
          </Badge>
          {until && entry.linkState !== "used" && (
            <EntryMeta>
              {entry.linkState === "expired" ? `была до ${until}` : `до ${until}`}
            </EntryMeta>
          )}
        </>
      }
    >
      <Stack $gap={8}>
        {entry.accessUrl ? (
          <CopyField label="Ссылка" value={entry.accessUrl} />
        ) : (
          <EntryMeta>
            {entry.linkState === "used"
              ? "По ссылке уже вошли — сама ссылка стёрта, она больше не нужна."
              : "Ссылка истекла и стёрта: если нужно, создай новую выше."}
          </EntryMeta>
        )}
        {entry.purchaseId && entry.archived !== "auto" && (
          <ArchiveRow>
            <AdminButton
              size="sm"
              variant="ghost"
              icon={
                entry.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />
              }
              onClick={() => void onArchive(entry.purchaseId!, !entry.archived)}
            >
              {entry.archived ? "Вернуть в журнал" : "Убрать из журнала"}
            </AdminButton>
          </ArchiveRow>
        )}
      </Stack>
    </Disclosure>
  );
};

const ArchiveRow = styled.div`
  display: flex;
  justify-content: flex-end;
`;

/**
 * «Журнал последних ссылок»: the links still in play; used a week ago, expired a
 * month ago or removed by hand wait in «Архив», folded.
 */
export const InviteLinkJournalCard = ({
  isInitialLoading,
  isLoading,
  links,
  onArchive,
  onRefresh,
}: InviteLinkJournalCardProps) => {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const current = links.filter((entry) => !entry.archived);
  const archived = links.filter((entry) => entry.archived);
  const render = (entry: GeneratedLinkEntry, index: number) => (
    <LinkEntry
      entry={entry}
      key={entry.purchaseId ?? `${entry.createdAtIso}-${index}`}
      onArchive={onArchive}
    />
  );

  return (
    <Panel
      title="Журнал последних ссылок"
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
      {isInitialLoading ? (
        <Stack $gap={10}>
          {Array.from({ length: JOURNAL_SKELETON_COUNT }, (_, index) => (
            <Skeleton key={`journal-skeleton-${index}`} $height={56} />
          ))}
        </Stack>
      ) : links.length === 0 ? (
        <EmptyState
          icon={<Link2 aria-hidden />}
          title="Ссылок пока нет"
          text="Здесь появятся ссылки, созданные в этом разделе."
        />
      ) : (
        <div>
          {current.map(render)}
          {current.length === 0 && (
            <EmptyState title="В журнале пусто — всё завершённое в архиве" />
          )}
          {archived.length > 0 && (
            <FieldNote>
              <TextButton type="button" onClick={() => setArchiveOpen(!archiveOpen)}>
                {archiveOpen ? "Свернуть архив" : `Архив · ${archived.length}`}
              </TextButton>
              {archiveOpen ? "" : " · использованные, истёкшие и убранные вручную"}
            </FieldNote>
          )}
          {archiveOpen && archived.map(render)}
        </div>
      )}
    </Panel>
  );
};
