export type ReviewAuthor =
  | "otter"
  | "fox"
  | "badger"
  | "panda"
  | "penguin"
  | "koala"
  | "rabbit"
  | "hedgehog"
  | "owl"
  | "capybara";

export type Review = {
  id: number;
  author: ReviewAuthor;
  text: string;
};
