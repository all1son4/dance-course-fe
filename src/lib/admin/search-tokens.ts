/**
 * The words of an admin search as the data stores them: a pasted profile link or a
 * leading "@" becomes the bare handle, so "@anna.dance", "instagram.com/anna.dance"
 * and "t.me/anna_dance" find the person like their handle does. Every word must
 * match somewhere, in any order: "kowalska first touch" narrows instead of failing.
 */
export const toAdminSearchTokens = (query: string) =>
  query
    .toLowerCase()
    .split(/\s+/u)
    .map((word) =>
      word
        .replace(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|t\.me)\//u, "")
        .replace(/[/?#].*$/u, "")
        .replace(/^@+/u, ""),
    )
    .filter(Boolean);
