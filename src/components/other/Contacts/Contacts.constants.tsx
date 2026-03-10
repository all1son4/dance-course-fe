import {
  CONTACT_PHONE_HREF,
  INSTAGRAM_PROFILE_HANDLE,
  INSTAGRAM_PROFILE_URL,
  PERSONAL_TELEGRAM_HANDLE,
  PERSONAL_TELEGRAM_URL,
} from "@/constants/links";
import { Insta, Phone, Telegram } from "@/svg";

import { TContact } from "./Contacts.types";

type Translate = (key: string) => string;

export const getContactsArray = (t: Translate): TContact[] => [
  {
    id: 1,
    icon: <Phone />,
    title: t("cards.phone"),
    text: "+48 571 571 214",
    link: CONTACT_PHONE_HREF,
  },
  {
    id: 2,
    icon: <Insta />,
    title: t("cards.instagram"),
    text: INSTAGRAM_PROFILE_HANDLE,
    link: INSTAGRAM_PROFILE_URL,
  },
  {
    id: 3,
    icon: <Telegram />,
    title: t("cards.telegram"),
    text: PERSONAL_TELEGRAM_HANDLE,
    link: PERSONAL_TELEGRAM_URL,
  },
];
