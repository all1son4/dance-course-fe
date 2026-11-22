import assert from "node:assert/strict";
import test from "node:test";

import { areNotificationsEnabled, isProductionDeployment } from "./deployment";

const environment = process.env as Record<string, string | undefined>;

const withEnv = (env: Record<string, string | undefined>, read: () => boolean) => {
  const names = ["ALLOW_TEST_MODE_NOTIFICATIONS", "NODE_ENV", "VERCEL_ENV"] as const;
  const saved = names.map((name) => [name, environment[name]] as const);
  for (const name of names) {
    if (env[name] === undefined) delete environment[name];
    else environment[name] = env[name];
  }
  try {
    return read();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete environment[name];
      else environment[name] = value;
    }
  }
};

test("Vercel decides production; NODE_ENV only where Vercel sets nothing", () => {
  assert.equal(withEnv({ VERCEL_ENV: "production" }, isProductionDeployment), true);
  assert.equal(
    withEnv({ NODE_ENV: "production", VERCEL_ENV: "preview" }, isProductionDeployment),
    false,
  );
  assert.equal(withEnv({ NODE_ENV: "production" }, isProductionDeployment), true);
  assert.equal(withEnv({ NODE_ENV: "development" }, isProductionDeployment), false);
});

test("notifications run in production or when test mode allows them", () => {
  assert.equal(withEnv({ VERCEL_ENV: "production" }, areNotificationsEnabled), true);
  assert.equal(withEnv({ VERCEL_ENV: "preview" }, areNotificationsEnabled), false);
  assert.equal(
    withEnv(
      { ALLOW_TEST_MODE_NOTIFICATIONS: "1", VERCEL_ENV: "preview" },
      areNotificationsEnabled,
    ),
    true,
  );
  assert.equal(
    withEnv(
      { ALLOW_TEST_MODE_NOTIFICATIONS: "true", VERCEL_ENV: "preview" },
      areNotificationsEnabled,
    ),
    false,
  );
});
