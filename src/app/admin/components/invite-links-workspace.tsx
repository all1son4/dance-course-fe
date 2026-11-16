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
  <Panel
    title="Бесплатный доступ"
    description="Доступ в Online Group и библиотеку для Plus — в разделе Online Group → «Ручной доступ»."
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
        text="Здесь появятся ссылки, созданные в этом разделе."
      />
    ) : (
      <JournalList>
        {links.map((entry, index) => (
          <JournalEntry key={`${entry.createdAtIso}-${index}`}>
            <Row $justify="space-between" $gap={10} $wrap={false}>
              <strong>{entry.selectionLabel}</strong>
              <Badge
                $tone={
                  entry.linkState === "active"
                    ? "success"
                    : entry.linkState === "expired"
                      ? "warning"
                      : "neutral"
                }
              >
                {resolveLinkStateLabel(entry.linkState)}
              </Badge>
            </Row>
            <EntryMeta>
              {entry.adminLabel || "Без имени"} · создано{" "}
              {formatDateTime(entry.createdAtIso)} · войти по ссылке можно до{" "}
              {entry.tokenExpiresAt
                ? formatDateTime(entry.tokenExpiresAt)
                : "не определено"}
            </EntryMeta>
            {entry.accessUrl && <CopyField label="Ссылка" value={entry.accessUrl} />}
          </JournalEntry>
        ))}
      </JournalList>
    )}
  </Panel>
);
