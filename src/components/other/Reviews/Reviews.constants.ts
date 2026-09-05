import type { Review } from "./Reviews.types";

export const REVIEWS = [
  {
    id: 1,
    author: "otter",
    text: `Thank you so much, Anna, for putting so much love and effort into creating this space. 🫶 Even though it can be challenging at times or life gets busy, I think the whole format is incredibly well thought out. I truly see it as a safe space to learn and grow.

I'm a huge fan of you and your work. I really admire the way you explain things and break them down into a way that's easy to understand. Thank you for everything you do. 🫶🫶🫶`,
  },
  {
    id: 2,
    author: "fox",
    text: "The course is prepared to a very high quality. It is perfect for me, and the current format suits me well. Thank you for your work ❤️",
  },
  {
    id: 3,
    author: "badger",
    text: `It was so inspiring to Watch everybodys Freestyle, so many interesting shapes, ways to Move, how everybody came up with different ways and ideas how to use the concepts.
And everyone has an own unique beautiful way of dancing.`,
  },
  {
    id: 4,
    author: "panda",
    text: "Thanks for your feedback Anna! 🫶🏻 I’m going to practice improvisation more. I still have a lot of work to do to make it look better and less chaotic. 😅 It was a really valuable experience, and I finally stepped out of my comfort zone! Thanks a lot for this lesson ❤️",
  },
  {
    id: 5,
    author: "penguin",
    text: `The last two Freestyle Sessions felt so nice. Being able to Just Dance and Move around without expectations of how it Looks is just freedom. Your Input helped so much- it was very interesting to work with it.
I Dance for nearly 1 h each time and now I‘m able to get through one Song without pausing and getting into my Head- „Is it enough, does it Look good. Will someone judge me for what I do“
Because in the end I just want to enjoy dancing.`,
  },
  {
    id: 6,
    author: "koala",
    text: "Thank you, Anna, for your feedback. 💔 It means so much to me—it actually brings tears to my eyes. 🥺 I am a very shy person, and that carries over into my dancing. It’s hard for me to believe in myself. I will work on that. I feel incredibly motivated to keep growing!🥹 I’m going to work even harder! I feel like I’m finally in the right place. I am so grateful for everything, and thank you so much for giving us the chance to grow! ❤️",
  },
  {
    id: 7,
    author: "rabbit",
    text: "I really like your teaching! Your explanations are always clear and easy to follow. Love the vibe of your choreos and routines. In your feedback, you mention what is good and what one needs to work on, which makes staying motivated and progress easier.",
  },
  {
    id: 8,
    author: "hedgehog",
    text: "You’re one of the best teacher I ever had!!! Not only are you good in technique and explaining BUT you also know how to interact between humans. You have the ability to keep an online group with many different people from all over the world to be active in group and share their stuff. AND you understand how to give very constructive and useful feedback without demotivating people!!! ❤️❤️❤️",
  },
  {
    id: 9,
    author: "owl",
    text: "I joined First Touch and loved the way you explain so clearly. Since I learned a lot about technique in First Touch I wanted to explore more",
  },
  {
    id: 10,
    author: "capybara",
    text: `I‘m soooo happy I joined your online Class, your lessons are very well rounded, interesting input. You manage to keep us all motivated. Loved your Check-in with us. It was also very helpful when you recorded the Videos when I had a Hard time understanding one Move, or give easier options when needed. Your Feedback is so thoughtful and Detail. Giving good Feedback is Not an easy Task, but you manage to give constructive Feedback but also Making sure to motivate everybody.

Overall just happy to be there. And I would love to join online courses with you more often. I learned and improved so much, but I had still sooo much fun along the way.`,
  },
] as const satisfies readonly Review[];

/**
 * Columns and gaps of the slider per viewport. Swiper applies them on init;
 * Reviews.styles.ts paints the same layout for the server-rendered frame so
 * that hydration does not reflow the section (Swiper's breakpoints are
 * `min-width` queries on the window, like the CSS ones).
 */
export const REVIEW_SLIDER_LAYOUT = {
  base: { slidesPerView: 1, spaceBetween: 14 },
  breakpoints: {
    600: { slidesPerView: 2, spaceBetween: 18 },
    1024: { slidesPerView: 3, spaceBetween: 20 },
  },
} as const;
