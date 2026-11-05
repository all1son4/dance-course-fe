export type LegalBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "lettered"; items: { mark: string; text: string; bullets: string[] }[] };

const LETTERED_LINE = /^([a-zа-я]\))\s+(.*)$/;
const BULLET_LINE = /^-\s+(.*)$/;

/**
 * Policies are stored as plain text with line breaks. The words stay exactly
 * as written; only the "a) ..." and "- ..." lines become real lists, so a long
 * enumeration no longer reads as one dense paragraph.
 */
export const parseLegalText = (text: string): LegalBlock[] => {
  const blocks: LegalBlock[] = [];

  for (const line of text.split("\n").filter((value) => value.trim() !== "")) {
    const last = blocks[blocks.length - 1];
    const lettered = line.match(LETTERED_LINE);
    const bullet = line.match(BULLET_LINE);

    if (lettered) {
      const item = { mark: lettered[1], text: lettered[2], bullets: [] as string[] };
      if (last?.kind === "lettered") {
        last.items.push(item);
      } else {
        blocks.push({ kind: "lettered", items: [item] });
      }
    } else if (bullet) {
      if (last?.kind === "lettered") {
        last.items[last.items.length - 1].bullets.push(bullet[1]);
      } else if (last?.kind === "bullets") {
        last.items.push(bullet[1]);
      } else {
        blocks.push({ kind: "bullets", items: [bullet[1]] });
      }
    } else {
      blocks.push({ kind: "paragraph", text: line });
    }
  }

  return blocks;
};
