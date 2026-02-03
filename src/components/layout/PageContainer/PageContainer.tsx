"use client";

import type { ReactNode } from "react";

import { Root } from "./PageContainer.styles";

export default function PageContainer({ children }: { children: ReactNode }) {
  return <Root>{children}</Root>;
}
