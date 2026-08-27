"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";

import {
  Body,
  CloseButton,
  Content,
  Description,
  Footer,
  Header,
  Overlay,
  Title,
  VisuallyHiddenTitle,
} from "./Dialog.styles";
import type { DialogProps } from "./Dialog.types";

export default function Dialog({
  children,
  open,
  onOpenChange,
  title,
  isTitleVisuallyHidden = false,
  description,
  footer,
  size = "md",
  closeLabel,
  className,
}: DialogProps) {
  const commonT = useTranslations("Common");
  const resolvedCloseLabel = closeLabel ?? commonT("closeDialog");
  const hasVisibleTitle = Boolean(title) && !isTitleVisuallyHidden;
  const hasHeader = hasVisibleTitle || Boolean(description);

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <Overlay />
        <Content
          $size={size}
          className={className}
          // Radix warns when neither a Description nor an explicit
          // `aria-describedby={undefined}` is given.
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          {title && !hasVisibleTitle && (
            <VisuallyHiddenTitle>{title}</VisuallyHiddenTitle>
          )}
          {hasHeader && (
            <Header>
              {hasVisibleTitle && <Title>{title}</Title>}
              {description && <Description>{description}</Description>}
            </Header>
          )}
          <CloseButton aria-label={resolvedCloseLabel} />
          <Body $hasHeader={hasHeader}>{children}</Body>
          {footer && <Footer>{footer}</Footer>}
        </Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
