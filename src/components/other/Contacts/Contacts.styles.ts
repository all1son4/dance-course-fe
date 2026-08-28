import { css, styled } from "styled-components";

import { SectionTitleBase } from "@/components/common/SectionTitle/SectionTitle.styles";
import { glass } from "@/styles/mixins/glass";

export const Container = styled.div<{ $bgColor?: string }>`
  padding: 80px;
  box-sizing: border-box;
  display: flex;
  width: 100%;
  gap: 150px;

  ${({ $bgColor }) =>
    glass({
      frost: "static",
      variant: "surface",
      radius: "var(--radius-slab)",
      bgParam: $bgColor ?? "rgba(255, 255, 255, 0.5)",
      hoverEffect: false,
    })}

  @media (max-width: 1340px) {
    gap: 100px;
  }

  @media (max-width: 1100px) {
    padding: 60px;
  }

  @media (max-width: 880px) {
    padding: 30px;
    gap: 40px;
    --glass-radius: var(--radius-panel);
  }

  @media (max-width: 680px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

export const TextBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 30px;
  width: 100%;
  max-width: 620px;
`;

export const Title = styled(SectionTitleBase)`
  letter-spacing: 0;
  color: var(--ink);
`;

export const ParagraphsBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const Paragraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  margin: 0;
  color: rgba(12, 12, 12, 1);
`;

export const IconsBox = styled.div`
  display: flex;
  flex-direction: column;
  padding: 20px 0 0 0;
  gap: 20px;
  justify-content: flex-start;
  align-items: flex-start;

  @media (max-width: 680px) {
    padding: 0;
    gap: 20px;
  }
`;

export type ContactsLayout = "bare" | "inset" | "slab" | "slabTight" | "spaced";

/*
 * The five ways the pages frame the contacts block, moved here from the page
 * style files (the CSS of each is unchanged):
 * - inset: side padding only (home);
 * - slab: white slab closing the page with 150px of air above (online);
 * - slabTight: the same slab with 50px above (offline);
 * - spaced: 150px of air above, inside an already white wrapper (course pages);
 * - bare: no wrapper (choreo, birthday drop).
 */
const SECTION_LAYOUTS: Record<Exclude<ContactsLayout, "bare">, ReturnType<typeof css>> = {
  inset: css`
    padding: 0 50px 100px;

    @media (max-width: 1240px) {
      padding: 0 0 100px;
    }

    @media (max-width: 1024px) {
      padding: 0 20px 100px;
    }

    @media (max-width: 880px) {
      padding: 0 20px 60px;
    }
  `,
  slab: css`
    display: flex;
    padding: 150px 100px 100px;
    margin: -1px 0 100px 0;
    box-sizing: border-box;
    background: var(--surface);
    border-radius: 0 0 100px 100px;

    @media (max-width: 1100px) {
      padding: 150px 50px 50px;
    }

    @media (max-width: 880px) {
      padding: 40px 20px;
      border-radius: 0 0 40px 40px;
      margin: -1px 0 60px 0;
    }
  `,
  slabTight: css`
    display: flex;
    padding: 50px 100px 100px;
    margin: 0 0 100px 0;
    box-sizing: border-box;
    background: var(--surface);
    border-radius: 0 0 100px 100px;

    @media (max-width: 1100px) {
      padding: 50px;
    }

    @media (max-width: 880px) {
      padding: 0 20px 40px;
      margin: 0 0 60px 0;
      border-radius: 0 0 40px 40px;
    }
  `,
  spaced: css`
    display: flex;
    padding: 150px 0 0 0;
    box-sizing: border-box;

    @media (max-width: 880px) {
      padding: 40px 0 0 0;
    }
  `,
};

export const Section = styled.section<{ $layout: Exclude<ContactsLayout, "bare"> }>`
  ${({ $layout }) => SECTION_LAYOUTS[$layout]}
`;
