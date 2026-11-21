import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { annaStrokStructuredDataId, normalizedSiteUrl } from "@/lib/seo";

import {
  buildCourseOffersStructuredData,
  buildCourseStructuredData,
} from "./structured-data";

describe("buildCourseStructuredData", () => {
  const course = buildCourseStructuredData({
    name: "First Touch",
    description: "A course for beginners.",
    path: "/online/first-touch",
    offers: buildCourseOffersStructuredData({
      landingPath: "/online/first-touch",
      offer: { prices: { eur: 50, pln: 250 } },
      availability: "PreOrder",
    }),
  });

  it("carries the fields Google's course list requires plus the provider", () => {
    assert.equal(course["@type"], "Course");
    assert.equal(course.name, "First Touch");
    assert.equal(course.description, "A course for beginners.");
    assert.equal(course.provider["@id"], annaStrokStructuredDataId);
    assert.equal(course.url, `${normalizedSiteUrl}/online/first-touch`);
  });

  it("offers the real price in both currencies with the given availability", () => {
    assert.deepEqual(
      course.offers.map(({ price, priceCurrency, availability }) => ({
        price,
        priceCurrency,
        availability,
      })),
      [
        { price: 50, priceCurrency: "EUR", availability: "https://schema.org/PreOrder" },
        { price: 250, priceCurrency: "PLN", availability: "https://schema.org/PreOrder" },
      ],
    );
  });
});
