export type TCookiePolicyItem = {
  id: number;
  title: string;
  text: string;
};

type TTranslate = (key: string) => string;

export const getCookiePolicyItems = (t: TTranslate): TCookiePolicyItem[] => [
  {
    id: 1,
    title: t("items.1.title"),
    text: t("items.1.text"),
  },
  {
    id: 2,
    title: t("items.2.title"),
    text: t("items.2.text"),
  },
  {
    id: 3,
    title: t("items.3.title"),
    text: t("items.3.text"),
  },
  {
    id: 4,
    title: t("items.4.title"),
    text: t("items.4.text"),
  },
  {
    id: 5,
    title: t("items.5.title"),
    text: t("items.5.text"),
  },
  {
    id: 6,
    title: t("items.6.title"),
    text: t("items.6.text"),
  },
];
