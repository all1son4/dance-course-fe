/**
 * The little markup of the bot's chat posts, the one people know from messengers:
 * `*bold*`, `~struck~` and lines starting with `> ` for a quote. The admin edits the
 * post as plain text in it; Telegram gets HTML, the admin preview gets the same
 * pieces as React nodes. Nothing else is interpreted, and everything is escaped.
 */
export type PostSpan = { bold: boolean; strike: boolean; text: string };
export type PostBlock = { lines: PostSpan[][]; quote: boolean };

const INLINE = /\*([^*\n]+)\*|~([^~\n]+)~/g;

const parseLine = (line: string): PostSpan[] => {
  const spans: PostSpan[] = [];
  let last = 0;
  for (const match of line.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last)
      spans.push({ bold: false, strike: false, text: line.slice(last, index) });
    spans.push({
      bold: match[1] !== undefined,
      strike: match[2] !== undefined,
      text: match[1] ?? match[2] ?? "",
    });
    last = index + match[0].length;
  }
  if (last < line.length)
    spans.push({ bold: false, strike: false, text: line.slice(last) });
  return spans;
};

/** Consecutive `> ` lines become one quote block; every other line stays as it is. */
export const parseTelegramPost = (text: string): PostBlock[] => {
  const blocks: PostBlock[] = [];
  for (const line of text.split("\n")) {
    const quote = line.startsWith("> ");
    const content = quote ? line.slice(2) : line;
    const previous = blocks.at(-1);
    if (previous && previous.quote === quote) previous.lines.push(parseLine(content));
    else blocks.push({ lines: [parseLine(content)], quote });
  }
  return blocks;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const spanHtml = ({ bold, strike, text }: PostSpan) => {
  const escaped = escapeHtml(text);
  if (bold) return `<b>${escaped}</b>`;
  if (strike) return `<s>${escaped}</s>`;
  return escaped;
};

/** The post as Telegram's `parse_mode: "HTML"` expects it. */
export const renderTelegramPostHtml = (text: string) =>
  parseTelegramPost(text)
    .map(({ lines, quote }) => {
      const body = lines.map((line) => line.map(spanHtml).join("")).join("\n");
      return quote ? `<blockquote>${body}</blockquote>` : body;
    })
    .join("\n");

export type PostButton = { text: string; url: string };

/** Buttons under a post, one per row: the only shape the bot sends. */
export const toInlineKeyboard = (buttons: PostButton[]) =>
  buttons.length > 0
    ? {
        inline_keyboard: buttons.map((button) => [
          { text: button.text, url: button.url },
        ]),
      }
    : undefined;

/** Reads the buttons back from a queued job; anything malformed is dropped. */
export const readPostButtons = (value: unknown): PostButton[] =>
  Array.isArray(value)
    ? value.filter(
        (button): button is PostButton =>
          typeof button === "object" &&
          button !== null &&
          typeof (button as PostButton).text === "string" &&
          typeof (button as PostButton).url === "string" &&
          /^https?:\/\//.test((button as PostButton).url),
      )
    : [];
