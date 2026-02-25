export type TQuestionsArray = {
  id: number;
  question: string;
  answer: string;
  link?: {
    href: string;
    label: string;
  };
}[];
