import { Copy, LoaderCircle } from "lucide-react";

import { CopyButton, IconActionButton, ResultBox, ResultValue } from "../page.styles";

type CopyableLinkProps = {
  ariaLabel?: string;
  disabled?: boolean;
  isCopying: boolean;
  link: string;
  onCopy: (link: string) => void | Promise<void>;
  title?: string;
};

export const CopyableLink = ({
  ariaLabel = "Копировать ссылку",
  disabled = false,
  isCopying,
  link,
  onCopy,
  title = "Копировать ссылку",
}: CopyableLinkProps) => (
  <ResultBox>
    <ResultValue>{link}</ResultValue>
    <CopyButton>
      <IconActionButton
        type="button"
        onClick={() => onCopy(link)}
        disabled={disabled || isCopying}
        $isLoading={isCopying}
        aria-label={ariaLabel}
        title={title}
      >
        {isCopying ? <LoaderCircle aria-hidden /> : <Copy aria-hidden />}
      </IconActionButton>
    </CopyButton>
  </ResultBox>
);
