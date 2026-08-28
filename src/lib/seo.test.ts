import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePageMetadata, splitKeywords } from "./page-metadata";
import {
  annaStrokStructuredDataId,
  buildBreadcrumbStructuredData,
  buildPageMetadata,
  buildWebsiteStructuredData,
  normalizedSiteUrl,
  seoImagePath,
} from "./seo";

describe("buildPageMetadata", () => {
  const input = {
    description: "Desc",
    keywords: ["a", "b"],
    locale: "en",
    ogImageAlt: "Alt",
    path: "/online/group",
    siteName: "Site",
    title: "Title",
  };

  it("mirrors title/description into Open Graph and Twitter and keeps the path canonical", () => {
    const metadata = buildPageMetadata(input);

    assert.equal(metadata.title, "Title");
    assert.equal(metadata.description, "Desc");
    assert.deepEqual(metadata.keywords, ["a", "b"]);
    assert.deepEqual(metadata.alternates, { canonical: "/online/group" });
    assert.equal(metadata.openGraph?.url, `${normalizedSiteUrl}/online/group`);
    assert.equal(metadata.openGraph?.title, "Title");
    assert.equal(metadata.openGraph?.siteName, "Site");
    assert.deepEqual(metadata.twitter, {
      card: "summary_large_image",
      title: "Title",
      description: "Desc",
      images: [seoImagePath],
    });
  });

  it("maps locales to Open Graph locales with Russian as the fallback", () => {
    const og = (locale: string) =>
      (buildPageMetadata({ ...input, locale }).openGraph as { locale?: string }).locale;

    assert.equal(og("en"), "en_US");
    assert.equal(og("pl"), "pl_PL");
    assert.equal(og("ru"), "ru_RU");
    assert.equal(og("de"), "ru_RU");
  });

  it("describes the shared 1200x630 preview image with the page's alt text", () => {
    const images = (buildPageMetadata(input).openGraph as { images: unknown[] }).images;

    assert.deepEqual(images, [
      { url: seoImagePath, alt: "Alt", width: 1200, height: 630, type: "image/jpeg" },
    ]);
  });
});

describe("buildBreadcrumbStructuredData", () => {
  it("numbers items from 1 and makes their URLs absolute", () => {
    assert.deepEqual(
      buildBreadcrumbStructuredData([
        { name: "Home", path: "/" },
        { name: "Online", path: "/online" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: `${normalizedSiteUrl}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Online",
            item: `${normalizedSiteUrl}/online`,
          },
        ],
      },
    );
  });
});

describe("buildWebsiteStructuredData", () => {
  it("links the WebSite to the Person through the shared @id", () => {
    const graph = buildWebsiteStructuredData("Site")["@graph"] as Array<
      Record<string, unknown>
    >;
    const [website, person] = graph;

    assert.equal(website["@type"], "WebSite");
    assert.equal(website.alternateName, "Site");
    assert.deepEqual(website.publisher, { "@id": annaStrokStructuredDataId });
    assert.equal(person["@id"], annaStrokStructuredDataId);
    assert.equal(person.name, "Anna Strok");
  });
});

describe("page metadata helper", () => {
  it("splits and trims keyword lists", () => {
    assert.deepEqual(splitKeywords(" dance, frame up ,, strip "), [
      "dance",
      "frame up",
      "strip",
    ]);
    assert.deepEqual(splitKeywords(""), []);
  });

  it("assembles a page's metadata from its translations in the SEO locale", () => {
    const strings: Record<string, string> = {
      title: "First Touch",
      description: "Course",
      ogImageAlt: "Photo",
      keywords: "a, b",
    };
    const metadata = resolvePageMetadata({
      pageT: (key) => strings[key],
      path: "/online/first-touch",
      siteName: "Site",
    });

    assert.equal(metadata.title, "First Touch");
    assert.deepEqual(metadata.keywords, ["a", "b"]);
    assert.equal((metadata.openGraph as { locale?: string }).locale, "en_US");
    assert.deepEqual(metadata.alternates, { canonical: "/online/first-touch" });
  });
});
