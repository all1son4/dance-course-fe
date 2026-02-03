import { Insta, Phone, Telegram } from "@/svg";

import { TContact } from "./Contacts.types";

export const contactsArray: TContact[] = [
  {
    id: 1,
    icon: <Phone />,
    title: "Phone number (Poland)",
    text: "+48 571 571 214",
    link: "tel:+48571571214",
  },
  {
    id: 2,
    icon: <Insta />,
    title: "Instagram",
    text: "anna.strok_dance",
    link: "https://www.instagram.com/anna.strok_dance",
  },
  {
    id: 3,
    icon: <Telegram />,
    title: "Telgram",
    text: "@annastrok_dance",
    link: "t.me/annastrok_dance",
  },
];
