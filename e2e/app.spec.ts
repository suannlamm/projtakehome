import { expect, test, type Page } from "@playwright/test";
import { accounts, PASSWORD } from "./accounts";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test.describe("signed out", () => {
  test("the landing page has no header sign-in button, and Get started leads to sign in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toHaveCount(0);
    await page.getByRole("link", { name: "Get started" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("a wrong password shows a clear error", async ({ page }) => {
    await signIn(page, accounts.ana.email, "not-the-password");
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  });

  test("signing up with an email that has an account says so", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.getByPlaceholder("Email").fill(accounts.ana.email);
    await page.getByPlaceholder("Password").fill("another-password");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByText("There's already an account associated with that email.")).toBeVisible();
  });

  test("a failed sign-in link explains itself instead of showing a blank form", async ({ page }) => {
    await page.goto("/auth/callback?code=not-a-real-code");
    await expect(page).toHaveURL(/\/login\?error=auth$/);
    await expect(page.getByText("That sign-in link didn't work.")).toBeVisible();
  });

  test("the API refuses every request with 401", async ({ request }) => {
    expect((await request.get("/api/feed")).status()).toBe(401);
  });
});

test("an account without a handle must pick a unique one before using anything", async ({ page }) => {
  await signIn(page, accounts.cal.email);
  await expect(page).toHaveURL(/\/onboarding$/);
  expect((await page.request.get("/api/feed")).status()).toBe(403);

  await page.getByPlaceholder("handle").fill(accounts.ana.handle);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That handle is taken")).toBeVisible();

  await page.getByPlaceholder("handle").fill("e2e_cal");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "@e2e_cal" })).toBeVisible();
  expect((await page.request.get("/api/feed")).status()).toBe(200);
});

// One member's journey, in order. Signs in once and keeps the session.
test.describe.serial("a signed-in member", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signIn(page, accounts.ana.email);
    await expect(page.getByRole("button", { name: `@${accounts.ana.handle}` })).toBeVisible();
  });
  test.afterAll(() => page.close());

  test("home asks for a watched film before recommending", async () => {
    await page.goto("/");
    await expect(page.getByText("Mark a film as watched and recommendations will appear here.")).toBeVisible();
  });

  test("search finds a film and adds it to the watchlist", async () => {
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByPlaceholder("Search by film, director or actor...").fill("Inception");
    const row = page.getByRole("listitem").filter({ hasText: "Inception 2010" }).first();
    await row.getByRole("button", { name: "Add to watchlist" }).click();
    await expect(row.getByRole("button", { name: "On your watchlist, click to remove" })).toBeVisible();

    await page.goto("/watchlist");
    await expect(page.getByRole("heading", { name: "Watchlist (1)" })).toBeVisible();
    await expect(page.getByText("Inception")).toBeVisible();
  });

  test("a review needs a rating, and rating marks the film watched", async () => {
    await page.goto("/movie/27205");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Pick a rating from 1 to 10 before saving.")).toBeVisible();

    await page.getByRole("button", { name: "8 out of 10" }).click();
    await page.getByPlaceholder("Write a review (optional)").fill("Holds up.");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Your review" })).toBeVisible();
    // Without a reload: the list buttons pick up the watched status from the server's refresh.
    await expect(page.getByRole("button", { name: "Watched", exact: true })).toBeVisible();
  });

  test("home recommends straight away once a film is rated (the cached row was cleared)", async () => {
    await page.goto("/");
    await expect(page.getByText("Recommended from your 1 watched film")).toBeVisible();
  });

  test("stats count the rating", async () => {
    await page.goto("/stats");
    await expect(page.getByText("8/10")).toBeVisible();
  });

  test("friends: share your handle, follow someone, then see their films", async () => {
    await page.goto(`/u/${accounts.ben.handle}`);
    await expect(page.getByText(`Follow @${accounts.ben.handle} to see what they've watched.`)).toBeVisible();

    await page.goto("/friends");
    await expect(page.getByText(`Share @${accounts.ana.handle} with your friends for them to find you.`)).toBeVisible();
    await page.getByPlaceholder("Handle or name...").fill(accounts.ben.handle);
    await page.getByPlaceholder("Handle or name...").press("Enter");
    await page.getByRole("button", { name: "Follow", exact: true }).click();
    await expect(page.getByRole("button", { name: "Following" })).toBeVisible();

    await page.goto("/friends");
    const entry = page.getByRole("listitem").filter({ hasText: "The Dark Knight" });
    await expect(entry).toContainText(`@${accounts.ben.handle}`);
    await expect(entry).toContainText("rated");

    await page.goto(`/u/${accounts.ben.handle}`);
    await expect(page.getByText("Still the best one.")).toBeVisible();
  });

  test("API responses never contain a user id", async () => {
    for (const path of [`/api/users/${accounts.ben.handle}`, `/api/users?q=e2e`, "/api/feed", "/api/recommendations"]) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(200);
      expect(await res.text(), path).not.toMatch(UUID);
    }
  });

  // Uses one real Gemini request.
  test("taste profile: generate, count it, then reuse it without another Gemini call", async () => {
    await page.goto("/recommendations");
    await expect(page.getByText("Generations today: 0/2")).toBeVisible();

    await page.getByRole("button", { name: "Generate" }).click();
    await expect(page.getByText("Generations today: 1/2")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/^Generated /)).toBeVisible();

    await page.getByRole("button", { name: "Regenerate" }).click();
    await expect(page.getByText("It's reused until your films, preferences or prompt change.")).toBeVisible();
    await expect(page.getByText("Generations today: 1/2")).toBeVisible();
  });

  test("the Friends tab replaced Activity, and signing out works", async () => {
    await expect(page.getByRole("link", { name: "Friends" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Activity" })).toHaveCount(0);
    await page.getByRole("button", { name: `@${accounts.ana.handle}` }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
