import { Check, Copy } from "lucide-react";
import { useState } from "react";
import styled from "styled-components";

import { useToast } from "./feedback";
import { focusVisible } from "./primitives";

/** Copies text and confirms with a toast, wherever in the admin it was pressed. */
export const useCopy = () => {
  const toast = useToast();

  return async (text: string, what = "Ссылка") => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: "success", title: `${what} скопирована` });
      return true;
    } catch {
      toast({
        tone: "danger",
        title: "Не удалось скопировать",
        description: "Выдели текст и скопируй вручную.",
      });
      return false;
    }
  };
};

const Field = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 4px 4px 4px 10px;
  border: 1px solid var(--a-border);
  border-radius: var(--a-radius-sm);
  background: var(--a-surface-sunken);

  [data-caption] {
    flex-shrink: 0;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--a-surface);
    color: var(--a-ink-2);
    font-size: var(--a-text-xs);
    font-weight: 600;
  }

  code {
    flex: 1;
    min-width: 0;
    font-family: var(--a-mono);
    font-size: var(--a-text-xs);
    color: var(--a-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--a-border-strong);
    border-radius: 6px;
    background: var(--a-surface);
    color: var(--a-ink);
    font: inherit;
    font-size: var(--a-text-sm);
    font-weight: 600;
    cursor: pointer;
    ${focusVisible}
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

/** A link the operator hands to a buyer: shown whole on hover, copied in one press. */
export const CopyField = ({
  caption,
  label = "Ссылка",
  value,
}: {
  /** A short visible tag ("Plus", "Хаб") when several links sit together. */
  caption?: string;
  label?: string;
  value: string;
}) => {
  const copy = useCopy();
  const [copied, setCopied] = useState(false);

  return (
    <Field>
      {caption && <span data-caption>{caption}</span>}
      <code title={value}>{value}</code>
      <button
        type="button"
        aria-label={`Копировать: ${label}`}
        onClick={async () => {
          if (await copy(value, label)) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Готово" : "Копировать"}
      </button>
    </Field>
  );
};
