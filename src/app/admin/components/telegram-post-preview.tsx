import { Fragment } from "react";
import styled from "styled-components";

import { parseTelegramPost, type PostButton } from "@/lib/telegram/post-markup";

const Bubble = styled.div`
  display: grid;
  gap: 6px;
  max-width: 460px;
`;

const Message = styled.div`
  padding: 10px 12px;
  border: 1px solid var(--a-border);
  border-radius: 14px 14px 14px 4px;
  background: var(--a-surface);
  color: var(--a-ink);
  font-size: var(--a-text-sm);
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const Quote = styled.div`
  margin: 2px 0;
  padding: 4px 8px 4px 10px;
  border-left: 3px solid var(--a-accent);
  border-radius: 4px;
  background: var(--a-accent-soft);
`;

const Buttons = styled.div`
  display: grid;
  gap: 4px;
`;

const Button = styled.a`
  display: block;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--a-surface-sunken);
  color: var(--a-ink);
  font-size: var(--a-text-sm);
  font-weight: 600;
  text-align: center;
  text-decoration: none;

  &:hover {
    background: var(--a-surface-hover);
  }
`;

type TelegramPostPreviewProps = {
  buttons: PostButton[];
  text: string;
};

/** How the bot's post looks in the chat: the same markup and buttons it sends. */
export function TelegramPostPreview({ buttons, text }: TelegramPostPreviewProps) {
  const blocks = parseTelegramPost(text);

  return (
    <Bubble>
      <Message>
        {blocks.map((block, blockIndex) => {
          const lines = block.lines.map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 && "\n"}
              {line.map((span, spanIndex) =>
                span.bold ? (
                  <b key={spanIndex}>{span.text}</b>
                ) : span.strike ? (
                  <s key={spanIndex}>{span.text}</s>
                ) : (
                  <Fragment key={spanIndex}>{span.text}</Fragment>
                ),
              )}
            </Fragment>
          ));
          return block.quote ? (
            <Quote key={blockIndex}>{lines}</Quote>
          ) : (
            <Fragment key={blockIndex}>{lines}</Fragment>
          );
        })}
      </Message>
      {buttons.length > 0 && (
        <Buttons>
          {buttons.map((button) => (
            <Button key={button.url} href={button.url} target="_blank" rel="noreferrer">
              {button.text}
            </Button>
          ))}
        </Buttons>
      )}
    </Bubble>
  );
}
