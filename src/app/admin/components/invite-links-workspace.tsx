import { Link2, RefreshCw } from "lucide-react";
import type { FormEvent } from "react";
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
  EmptyState,
  Muted,
  Panel,
  Row,
  Skeleton,
  Stack,
} from "../ui/primitives";

const GeneratorForm = styled.form`
  display: grid;
  gap: 14px;
`;

const JournalList = styled.ul`
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const JournalEntry = styled.li`
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--a-border);
  border-radius: var(--a-radius);
  background: var(--a-surface);

  strong {
    min-width: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
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
  <Panel title="Генератор доступа">
    <GeneratorForm onSubmit={onSubmit}>
      <Field label="Что генерируем" htmlFor="generator-kind">
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
        label="Идентификатор"
        htmlFor="admin-link-label"
        hint="Видно только в журнале — чтобы понять, кому выдана ссылка."
      >
        <Input
          id="admin-link-label"
          name="adminLinkLabel"
          value={adminLabel}
          placeholder="Например: Аня / спец-оффер / блогер"
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
          {isGenerating ? "Генерирую…" : "Сгенерировать ссылку"}
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
  onRefresh: () => void | Promise<void>;
};

export const InviteLinkJournalCard = ({
  isInitialLoading,
  isLoading,
  links,
  onRefresh,
}: InviteLinkJournalCardProps) => (
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
          <Skeleton key={`journal-skeleton-${index}`} $height={96} />
        ))}
      </Stack>
    ) : links.length === 0 ? (
      <EmptyState
        icon={<Link2 aria-hidden />}
        title="Ссылок пока нет"
        text="Созданных администратором ссылок нет."
      />
    ) : (
      <JournalList>
        {links.map((entry) => (
          <JournalEntry key={`${entry.accessUrl}-${entry.createdAtIso}`}>
            <Row $justify="space-between" $gap={10} $wrap={false}>
              <strong>{entry.selectionLabel}</strong>
              <Badge $tone={entry.linkState === "used" ? "neutral" : "success"}>
                {resolveLinkStateLabel(entry.linkState)}
              </Badge>
            </Row>
            <EntryMeta>
              {entry.adminLabel || "Без идентификатора"} · создано{" "}
              {formatDateTime(entry.createdAtIso)} · действует до{" "}
              {entry.tokenExpiresAt
                ? formatDateTime(entry.tokenExpiresAt)
                : "не определено"}
            </EntryMeta>
            <CopyField label="Ссылка" value={entry.accessUrl} />
          </JournalEntry>
        ))}
      </JournalList>
    )}
  </Panel>
);
