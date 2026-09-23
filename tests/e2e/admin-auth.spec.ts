import { expect, test } from "@playwright/test";

test("admin distinguishes an unavailable check from an expired session", async ({
  page,
}) => {
  let sessionState: "authorized" | "unavailable" | "unauthorized" = "unavailable";
  let authCheckCount = 0;

  await page.route("**/admin/auth", async (route) => {
    authCheckCount += 1;

    if (sessionState === "unavailable") {
      await route.abort("failed");
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ authorized: sessionState === "authorized" }),
    });
  });
  await page.route("**/admin/api/**", (route) =>
    route.fulfill({ contentType: "application/json", body: '{"items":[]}' }),
  );

  await page.goto("/admin");

  await expect(
    page.getByText("Не удалось проверить сессию.", { exact: false }),
  ).toBeVisible();

  sessionState = "authorized";
  await page.getByRole("button", { name: "Проверить сессию ещё раз" }).click();
  await expect(page.getByText("Сессия подтверждена")).toBeVisible();

  const checksBeforeReturn = authCheckCount;

  await page.clock.install();
  await page.clock.fastForward(16_000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => authCheckCount).toBe(checksBeforeReturn + 1);

  sessionState = "unauthorized";
  // Next dev's floating toolbar overlaps the bottom-left sidebar button;
  // keyboard activation also verifies that the action remains accessible.
  const sessionCheckButton = page.getByRole("button", {
    name: "Проверить сессию",
    exact: true,
  });

  await sessionCheckButton.focus();
  await sessionCheckButton.press("Enter");
  await expect(page.getByText("Сессия закончилась. Введи пароль снова.")).toBeVisible();
});

test("admin keeps the shared-password flow and verifies an uncertain logout", async ({
  page,
}) => {
  let authorized = false;
  let loseLoginResponse = true;
  let loseLogoutResponse = true;

  await page.route("**/admin/auth", async (route) => {
    const method = route.request().method();

    if (method === "POST") {
      const body = route.request().postDataJSON() as { password?: string };

      if (body.password !== "test-only-password") {
        await route.fulfill({
          contentType: "application/json",
          status: 401,
          body: '{"errorCode":"invalid_password"}',
        });
        return;
      }

      authorized = true;

      if (loseLoginResponse) {
        loseLoginResponse = false;
        await route.abort("failed");
        return;
      }
    }

    if (method === "DELETE") {
      if (loseLogoutResponse) {
        loseLogoutResponse = false;
        await route.abort("failed");
        return;
      }

      authorized = false;
    }

    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ authorized, status: "ok" }),
    });
  });
  await page.route("**/admin/api/**", (route) =>
    route.fulfill({ contentType: "application/json", body: '{"items":[]}' }),
  );

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Вход в админ-панель" })).toBeVisible();

  await page.getByLabel("Пароль").fill("wrong-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByText("Неверный пароль.")).toBeVisible();

  await page.getByLabel("Пароль").fill("test-only-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByText("Сессия подтверждена")).toBeVisible();

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(
    page.getByText("Выход не завершён: сессия ещё активна.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page.getByText("Вы вышли из админки.")).toBeVisible();
});
