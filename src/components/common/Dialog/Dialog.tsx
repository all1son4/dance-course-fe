"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { prefersReducedMotion } from "@/lib/reveal";

import {
  Body,
  CloseButton,
  Content,
  CONTENT_MORPH_MS,
  Description,
  Footer,
  Header,
  MorphBox,
  MorphContent,
  Overlay,
  SheetGrabber,
  Title,
  VisuallyHiddenTitle,
} from "./Dialog.styles";
import type { DialogProps } from "./Dialog.types";

/** Phones: the dialog is a bottom sheet (see Dialog.styles) and has to dodge the keyboard. */
const SHEET_MEDIA_QUERY = "(max-width: 520px)";
const KEYBOARD_INSET_PROPERTY = "--sheet-keyboard-inset";

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
  contentKey,
  isContentLeaving = false,
}: DialogProps) {
  const commonT = useTranslations("Common");
  const resolvedCloseLabel = closeLabel ?? commonT("closeDialog");
  const hasVisibleTitle = Boolean(title) && !isTitleVisuallyHidden;
  const hasHeader = hasVisibleTitle || Boolean(description);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const morphBoxRef = useRef<HTMLDivElement | null>(null);
  // The content's natural height as of the last commit: the starting point of
  // the next height glide. Measured after every render because the content
  // (a form being filled, an error appearing) changes height without a key change.
  const lastHeightRef = useRef<number | null>(null);
  const lastKeyRef = useRef(contentKey);
  // Bumped on every key change (React's adjust-state-on-change pattern):
  // remounts MorphContent so its entrance plays again.
  const [renderedKey, setRenderedKey] = useState(contentKey);
  const [morphGeneration, setMorphGeneration] = useState(0);

  if (renderedKey !== contentKey) {
    setRenderedKey(contentKey);
    setMorphGeneration((generation) => generation + 1);
  }

  useLayoutEffect(() => {
    const box = morphBoxRef.current;

    if (!box) {
      lastHeightRef.current = null;
      return;
    }

    if (lastKeyRef.current !== contentKey) {
      lastKeyRef.current = contentKey;
      const from = lastHeightRef.current;
      const to = box.offsetHeight;

      if (from !== null && from !== to && !prefersReducedMotion()) {
        box.style.height = `${from}px`;
        box.style.overflow = "hidden";
        // Commit the start height before switching to the end height, or
        // there is nothing to transition from.
        box.getBoundingClientRect();
        // The settle pause lets the browser lay out and paint the new screen
        // before the glide starts, so its first visible frame is not already
        // half way there (the same stutter the reveals showed without it).
        box.style.transition = `height ${CONTENT_MORPH_MS}ms var(--ease-emphasized, ease) var(--motion-settle, 40ms)`;
        box.style.height = `${to}px`;

        const settle = () => {
          window.clearTimeout(fallback);
          box.removeEventListener("transitionend", settle);
          box.style.height = "";
          box.style.overflow = "";
          box.style.transition = "";
        };
        const fallback = window.setTimeout(settle, CONTENT_MORPH_MS + 200);

        box.addEventListener("transitionend", settle);
      }
      lastHeightRef.current = to;
      return;
    }

    lastHeightRef.current = box.offsetHeight;
  });

  // iOS never resizes the layout viewport for the keyboard, only the visual
  // one, so a sheet pinned to `bottom: 0` would sit behind the keys. Track the
  // visual viewport and lift the sheet by the covered height.
  useEffect(() => {
    const viewport = window.visualViewport;
    const content = contentRef.current;

    if (!open || !viewport || !content || !window.matchMedia(SHEET_MEDIA_QUERY).matches) {
      return;
    }

    const update = () => {
      const inset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      content.style.setProperty(KEYBOARD_INSET_PROPERTY, `${Math.round(inset)}px`);
    };

    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    update();

    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      content.style.removeProperty(KEYBOARD_INSET_PROPERTY);
    };
  }, [open]);

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <Overlay />
        <Content
          ref={contentRef}
          $size={size}
          className={className}
          // Radix warns when neither a Description nor an explicit
          // `aria-describedby={undefined}` is given.
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <SheetGrabber aria-hidden />
          {title && !hasVisibleTitle && (
            <VisuallyHiddenTitle>{title}</VisuallyHiddenTitle>
          )}
          <CloseButton aria-label={resolvedCloseLabel} />
          <MorphBox ref={morphBoxRef}>
            <MorphContent
              key={morphGeneration}
              $isEntering={morphGeneration > 0}
              data-morph={isContentLeaving ? "out" : undefined}
            >
              {hasHeader && (
                <Header>
                  {hasVisibleTitle && <Title>{title}</Title>}
                  {description && <Description>{description}</Description>}
                </Header>
              )}
              <Body $hasHeader={hasHeader}>{children}</Body>
              {footer && <Footer>{footer}</Footer>}
            </MorphContent>
          </MorphBox>
        </Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
