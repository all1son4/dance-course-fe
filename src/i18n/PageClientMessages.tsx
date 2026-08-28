import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";

import { pickMessages } from "./client-messages";

type PageClientMessagesProps = {
  /** Namespaces (or dotted sub-trees) the page's client components use. */
  namespaces: readonly string[];
  children: ReactNode;
};

/**
 * Hands a page's client components exactly the messages they use. The locale
 * layout only ships the global namespaces; a nested provider replaces those
 * for its subtree, so "Common" (shared client UI) is always included here.
 */
export default async function PageClientMessages({
  namespaces,
  children,
}: PageClientMessagesProps) {
  const messages = pickMessages(await getMessages(), ["Common", ...namespaces]);

  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
