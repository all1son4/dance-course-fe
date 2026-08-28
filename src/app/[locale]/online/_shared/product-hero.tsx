import type { ComponentType, ReactNode } from "react";

type ProductHeroProps = {
  /** The page's hero section and text column (sizes and offsets differ per page). */
  components: {
    Section: ComponentType<{ children?: ReactNode }>;
    TextBox: ComponentType<{ children?: ReactNode }>;
  };
  /** Title, description, facts and buttons. */
  children: ReactNode;
  /** The hero art, normally a <HeroMedia>. */
  media: ReactNode;
};

/** Text column on the left, art on the right (stacked on phones): the shape every product hero shares. */
export default function ProductHero({
  children,
  components: { Section, TextBox },
  media,
}: ProductHeroProps) {
  return (
    <Section>
      <TextBox>{children}</TextBox>
      {media}
    </Section>
  );
}
