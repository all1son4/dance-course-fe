import { Insta, Phone, Telegram } from "@/svg";

import { TContact } from "./Contacts.types";

type Translate = (key: string) => string;

export const getContactsArray = (t: Translate): TContact[] => [
  {
    id: 1,
    icon: <Phone />,
    title: t("cards.phone"),
    text: "+48 571 571 214",
    link: "tel:+48571571214",
  },
  {
    id: 2,
    icon: <Insta />,
    title: t("cards.instagram"),
    text: "anna.strok_dance",
    link: "https://www.instagram.com/anna.strok_dance",
  },
  {
    id: 3,
    icon: <Telegram />,
    title: t("cards.telegram"),
    text: "@annastrok_dance",
    link: "https://t.me/annastrok_dance",
  },
];
