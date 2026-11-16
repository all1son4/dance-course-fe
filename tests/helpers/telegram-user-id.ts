import { randomInt } from "node:crypto";

// Hub writers serialize on a per-owner advisory lock. A fixed owner shared by test
// files that the runner executes in parallel couples them through that lock and
// deadlocks with table-level DDL in other files, so every file draws its own owner.
export const createTestTelegramUserId = (): string =>
  String(randomInt(1_000_000_000, 2 ** 47));

export const createTestTelegramUserIdPair = (): [string, string] => {
  const owner = createTestTelegramUserId();
  let other = createTestTelegramUserId();

  while (other === owner) {
    other = createTestTelegramUserId();
  }

  return [owner, other];
};
