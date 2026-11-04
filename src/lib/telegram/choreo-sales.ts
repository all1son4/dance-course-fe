import {
  LOVE_ME_IN_THE_MORNING_PRODUCT_ID,
  type SellableProduct,
} from "@/constants/sellable-products";

import { getTelegramChannelTargetByOfferId } from "./config";

/** The standalone tutorial must use its own RU/EN channels before launch. */
export const getMissingChoreoLessonLanguages = (product: SellableProduct) => {
  if (product.id !== LOVE_ME_IN_THE_MORNING_PRODUCT_ID) return [];

  return (["ru", "en"] as const).filter((lessonLanguage) =>
    product.offers.some(
      (offer) =>
        !getTelegramChannelTargetByOfferId({
          lessonLanguage,
          offerId: offer.id,
        }),
    ),
  );
};
