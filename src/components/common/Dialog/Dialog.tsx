"use client";

import * as RadixDialog from "@radix-ui/react-dialog";

import {
  Body,
  CloseButton,
  Content,
  Description,
  Footer,
  Header,
  Overlay,
  Title,
} from "./Dialog.styles";
import type { DialogProps } from "./Dialog.types";

export default function Dialog({
  children,
  open,
  onOpenChange,
  title,
  description,
  footer,
  size = "md",
  closeLabel = "Close dialog",
  className,
}: DialogProps) {
  const hasHeader = Boolean(title || description);

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <Overlay />
        <Content $size={size} className={className}>
          {hasHeader && (
            <Header>
              {title && <Title>{title}</Title>}
              {description && <Description>{description}</Description>}
            </Header>
          )}
          <CloseButton aria-label={closeLabel} />
          <Body $hasHeader={hasHeader}>{children}</Body>
          {footer && <Footer>{footer}</Footer>}
        </Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
