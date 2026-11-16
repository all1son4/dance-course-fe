import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDeclaredMigrationPhase } from "@/db/migration-policy";

import { withHubAccessFixture } from "../helpers/hub-access-fixture";
import { createTestTelegramUserId } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), {
  max: 1,
  prepare: false,
});

after(async () => {
  await client.end();
});

const TELEGRAM_USER_ID = createTestTelegramUserId();
const VERIFIED_AT = new Date("2026-11-16T09:00:00.000Z");
const EXPIRES_AT = new Date("2026-11-16T10:00:00.000Z");

type VerificationValues = {
  checkout_session_id?: string;
  telegram_user_id?: string;
  basis?: string | null;
  cohort_id?: string | null;
  status?: string;
  verified_at?: Date | null;
  expires_at?: Date;
};

const insertVerification = (tx: postgres.TransactionSql, values: VerificationValues) =>
  tx<{ id: string; basis: string | null; cohort_id: string | null; status: string }[]>`
    INSERT INTO hub_discount_verifications ${tx({
      checkout_session_id: `checkout_${randomUUID()}`,
      telegram_user_id: TELEGRAM_USER_ID,
      expires_at: EXPIRES_AT,
      status: "verified",
      verified_at: VERIFIED_AT,
      ...values,
    })}
    RETURNING id, basis, cohort_id, status
  `;

const hasConstraintViolation =
  (code: string, constraintName: string) =>
  (error: unknown): boolean =>
    error instanceof postgres.PostgresError &&
    error.code === code &&
    error.constraint_name === constraintName;

const rejectsWith = (
  values: VerificationValues,
  constraintName: string,
  code = "23514",
): Promise<void> =>
  withHubAccessFixture(client, async ({ tx }) => {
    await assert.rejects(
      insertVerification(tx, values),
      hasConstraintViolation(code, constraintName),
    );
  });

const insertOffer = (tx: postgres.TransactionSql, productId: string, code: string) =>
  tx`
    INSERT INTO product_offers (external_offer_id, product_id, code, label)
    VALUES (${`offer_${randomUUID()}`}, ${productId}, ${code}, 'Hub offer')
  `;

const withProduct = (
  run: (tx: postgres.TransactionSql, productId: string) => Promise<void>,
) =>
  withHubAccessFixture(client, async ({ tx }) => {
    const suffix = randomUUID();
    const [product] = await tx<{ id: string }[]>`
      INSERT INTO products (
        code, external_product_id, slug, type, title, description, description_keys
      )
      VALUES (${`hub_${suffix}`}, ${`hub_${suffix}`}, ${`hub-${suffix}`}, 'course',
        'Inspiration Hub', '[]'::jsonb, '[]'::jsonb)
      RETURNING id
    `;

    await run(tx, product.id);
  });

test("the Hub catalogue and discount migration is declared as an expand release", () => {
  const source = readFileSync("drizzle/0027_hub_catalog_discount.sql", "utf8");

  assert.equal(getDeclaredMigrationPhase(source), "expand");
});

test("a course product accepts the two Hub offer codes", async () => {
  await withProduct(async (tx, productId) => {
    await insertOffer(tx, productId, "hub-access");
    await insertOffer(tx, productId, "hub-renewal");

    const offers = await tx<{ code: string }[]>`
      SELECT code FROM product_offers WHERE product_id = ${productId} ORDER BY code
    `;

    assert.deepEqual(
      offers.map(({ code }) => code),
      ["hub-access", "hub-renewal"],
    );
  });
});

test("an unknown offer code is still rejected", async () => {
  await withProduct(async (tx, productId) => {
    await assert.rejects(
      insertOffer(tx, productId, "hub-gift"),
      hasConstraintViolation("23514", "product_offers_code_check"),
    );
  });
});

test("a cohort-chat discount stores the cohort that granted it", async () => {
  await withHubAccessFixture(client, async ({ cohortId, tx }) => {
    const [row] = await insertVerification(tx, {
      basis: "cohort_chat",
      cohort_id: cohortId,
    });

    assert.equal(row.basis, "cohort_chat");
    assert.equal(row.cohort_id, cohortId);
  });
});

test("an active-Hub discount carries no cohort", async () => {
  await withHubAccessFixture(client, async ({ tx }) => {
    const [row] = await insertVerification(tx, { basis: "active_hub" });

    assert.equal(row.basis, "active_hub");
    assert.equal(row.cohort_id, null);
  });
});

test("not-member and failed checks have no basis and no cohort", async () => {
  await withHubAccessFixture(client, async ({ tx }) => {
    const [notMember] = await insertVerification(tx, {
      status: "not_member",
      verified_at: null,
    });
    const [failed] = await insertVerification(tx, {
      status: "failed",
      verified_at: null,
    });

    assert.equal(notMember.basis, null);
    assert.equal(failed.basis, null);
  });
});

test("a cohort-chat discount without a cohort is rejected", async () => {
  await rejectsWith({ basis: "cohort_chat" }, "hub_discount_verifications_cohort_check");
});

test("an active-Hub discount with a cohort is rejected", async () => {
  await withHubAccessFixture(client, async ({ cohortId, tx }) => {
    await assert.rejects(
      insertVerification(tx, { basis: "active_hub", cohort_id: cohortId }),
      hasConstraintViolation("23514", "hub_discount_verifications_cohort_check"),
    );
  });
});

test("a failed check cannot keep a cohort", async () => {
  await withHubAccessFixture(client, async ({ cohortId, tx }) => {
    await assert.rejects(
      insertVerification(tx, {
        status: "failed",
        verified_at: null,
        cohort_id: cohortId,
      }),
      hasConstraintViolation("23514", "hub_discount_verifications_cohort_check"),
    );
  });
});

test("a verified check needs a basis and a verification time", async () => {
  await rejectsWith({ basis: null }, "hub_discount_verifications_verified_check");
  await rejectsWith(
    { basis: "active_hub", verified_at: null },
    "hub_discount_verifications_verified_check",
  );
});

test("a not-member check cannot claim a basis", async () => {
  await rejectsWith(
    { status: "not_member", basis: "active_hub" },
    "hub_discount_verifications_verified_check",
  );
});

test("unknown status and basis values are rejected", async () => {
  await rejectsWith(
    { status: "pending", basis: null },
    "hub_discount_verifications_status_check",
  );
  await rejectsWith({ basis: "friend" }, "hub_discount_verifications_basis_check");
});

test("blank session and Telegram IDs are rejected", async () => {
  await rejectsWith(
    { basis: "active_hub", checkout_session_id: " " },
    "hub_discount_verifications_ids_check",
  );
  await rejectsWith(
    { basis: "active_hub", telegram_user_id: "" },
    "hub_discount_verifications_ids_check",
  );
});

test("one checkout session holds one verification", async () => {
  await withHubAccessFixture(client, async ({ tx }) => {
    const checkoutSessionId = `checkout_${randomUUID()}`;

    await insertVerification(tx, {
      basis: "active_hub",
      checkout_session_id: checkoutSessionId,
    });
    await assert.rejects(
      insertVerification(tx, {
        basis: "active_hub",
        checkout_session_id: checkoutSessionId,
      }),
      hasConstraintViolation("23505", "hub_discount_verifications_checkout_idx"),
    );
  });
});

test("a cohort that granted a discount cannot be deleted", async () => {
  await withHubAccessFixture(client, async ({ cohortId, tx }) => {
    await insertVerification(tx, { basis: "cohort_chat", cohort_id: cohortId });

    await assert.rejects(
      tx`DELETE FROM online_group_cohorts WHERE id = ${cohortId}`,
      hasConstraintViolation("23503", "hub_discount_verifications_cohort_fk"),
    );
  });
});
