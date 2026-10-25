import AxeBuilder from "@axe-core/playwright";
import {
  test,
  expect,
  request as requestFactory,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
const origin = "http://127.0.0.1:3100";
// Reuse authenticated API fixture sessions so expanding the suite doesn't exhaust
// the production login limiter. Browser sign-in/sign-out coverage remains unchanged.
const apiSessions = new Map<string, {
  storageState: Awaited<ReturnType<APIRequestContext["storageState"]>>;
  csrfToken: string;
}>();
async function account(email: string) {
  const accounts = JSON.parse(
    await readFile(".local/e2e-accounts.json", "utf8"),
  ) as { email: string; password: string }[];
  return accounts.find((a) => a.email === email)!;
}
async function login(page: Page, email: string) {
  const a = await account(email);
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(a.email);
  await page.getByLabel("Password", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Requests", exact: true }),
  ).toBeVisible();
}
async function context(email: string) {
  const cached = apiSessions.get(email);
  if (cached) return {
    context: await requestFactory.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin }, storageState: cached.storageState }),
    headers: { Origin: origin, "X-CSRF-Token": cached.csrfToken },
  };
  const a = await account(email);
  const context = await requestFactory.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  const response = await context.post("/api/login", { data: a });
  expect(response.status()).toBe(200);
  const login = await response.json();
  apiSessions.set(email, { storageState: await context.storageState(), csrfToken: login.csrfToken });
  return {
    context,
    headers: { Origin: origin, "X-CSRF-Token": login.csrfToken },
  };
}
async function createCase(
  action: "CANCEL_AT_PERIOD_END" | "REFUND_PAYMENT" = "CANCEL_AT_PERIOD_END",
) {
  const customer = await context("customer.a@proofit.test");
  const text = "Browser test " + action + " " + Date.now();
  const request = await (
    await customer.context.post("/api/requests", {
      headers: customer.headers,
      data: { text },
    })
  ).json();
  const parameters =
    action === "CANCEL_AT_PERIOD_END"
      ? { type: action, subscriptionId: "sub_fixture_a", timing: "PERIOD_END" }
      : {
          type: action,
          paymentId: "pi_fixture_b",
          amountMinor: 2000,
          currency: "MYR",
        };
  const confirmed = await customer.context.post("/api/confirm", {
    headers: customer.headers,
    data: { requestId: request.id, requestVersion: 1, action: parameters },
  });
  expect(confirmed.status()).toBe(200);
  const receipt = await confirmed.json();
  await customer.context.dispose();
  return { request, receipt, text };
}
async function propose(id: string, action: unknown) {
  const staff = await context("support.a@proofit.test");
  const response = await staff.context.post("/api/proposals", {
    headers: staff.headers,
    data: {
      requestId: id,
      requestVersion: 1,
      proposal: action,
      conversation: "Explicit manual browser-test proposal.",
    },
  });
  expect(response.status()).toBe(201);
  await staff.context.dispose();
}
async function open(page: Page, view: string, id: string) {
  await page.goto("/#/" + view + "/" + id + "?version=1");
  await expect(
    page.locator(
      view === "review"
        ? ".review-case-header"
        : view === "replay"
          ? ".replay-page-header"
          : ".case-context",
    ),
  ).toBeVisible();
}
async function noOverflow(page: Page) {
  // Viewport changes can complete before Chromium has painted the responsive layout.
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const overflowing = await page
    .locator("body *")
    .evaluateAll((elements) =>
      elements
        .filter(
          (element) => element.getBoundingClientRect().right > innerWidth + 1,
        )
        .map((element) => element.tagName + "." + element.className),
    );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    overflowing.join(", "),
  ).toBe(true);
}

test("customer creates and exactly confirms a cancellation; refresh preserves the receipt", async ({
  page,
}) => {
  await login(page, "customer.a@proofit.test");
  await expect(
    page.getByRole("link", { name: "Investigations", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page
    .getByLabel("What would you like to change?")
    .fill("Cancel my next renewal while keeping current access.");
  await page
    .getByRole("button", { name: "Create request", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Make the intent explicit" }),
  ).toBeVisible();
  await page
    .getByLabel("Subscription", { exact: true })
    .selectOption("sub_fixture_a");
  expect(
    await page
      .getByLabel("Subscription", { exact: true })
      .locator("option")
      .allTextContents(),
  ).not.toContain("sub_fixture_b · synthetic");
  await page
    .getByRole("button", { name: "Review confirmation", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "End of the current paid period",
  );
  await page
    .getByRole("button", { name: "Confirm exact action", exact: true })
    .click();
  await expect(
    page.getByText("Confirmation recorded", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "What was confirmed" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revise request", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 900 });
  await noOverflow(page);
  await mkdir(".local/e2e-shots", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".local/e2e-shots/customer-mobile.png",
    fullPage: true,
  });
});
test("queued case progress updates automatically and stops polling when review finishes", async ({ page }) => {
  const c = await createCase();
  await login(page, "customer.a@proofit.test");
  let reads = 0;
  let writes = 0;
  page.on("request", request => { if (request.method() === "POST") writes++; });
  await page.route("**/api/requests/" + c.request.id + "?version=1", async route => {
    const response = await route.fetch();
    const body = await response.json();
    reads++;
    const complete = reads >= 3;
    body.automation = { ...body.automation, status: complete ? "REVIEW_REQUIRED" : reads === 1 ? "QUEUED" : "INVESTIGATING",
      message: complete ? "Synthetic review finished; provider submission remains disabled." : "Synthetic queued review is processing." };
    await route.fulfill({ response, json: body });
  });
  await open(page, "request", c.request.id);
  await expect(page.locator(".automation-status")).toContainText("QUEUED");
  await expect(page.locator(".automation-status")).toContainText("REVIEW REQUIRED");
  const completedReads = reads;
  // Wait longer than the polling interval to verify a terminal state doesn't keep requesting.
  await page.waitForTimeout(2000);
  expect(reads).toBe(completedReads);
  expect(writes).toBe(0);
});

test("staff manually proposes an unauthorised refund; the backend blocks it", async ({
  page,
}) => {
  const c = await createCase();
  await login(page, "support.a@proofit.test");
  await open(page, "review", c.request.id);
  await page.getByRole("button", { name: "Add proposal", exact: true }).click();
  await page
    .getByLabel("Action", { exact: true })
    .selectOption("REFUND_PAYMENT");
  await page
    .getByLabel("Payment", { exact: true })
    .selectOption("pi_fixture_b");
  await page.getByLabel("Exact refund amount (MYR)").fill("20.00");
  await page
    .getByRole("button", { name: "Store proposal", exact: true })
    .click();
  await expect(page.locator(".comparison")).toContainText("MYR 20.00");
  await expect(page.locator(".comparison")).toContainText(
    "Cancel next renewal",
  );
  await page.getByRole("button", { name: "Run rules", exact: true }).click();
  await expect(page.locator(".decision-summary")).toContainText("Blocked");
  await expect(
    page.getByText("Proposal differs from confirmed exact action.", {
      exact: true,
    }),
  ).toBeVisible();
  await mkdir(".local/e2e-shots", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".local/e2e-shots/staff-review-desktop.png",
    fullPage: true,
  });
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await noOverflow(page);
  }
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const reviewAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    reviewAudit.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".local/e2e-shots/staff-review-dark.png",
    fullPage: true,
  });
});
test("support cannot approve; an authenticated approver confirms only the stored exact receipt", async ({
  page,
}) => {
  const c = await createCase("REFUND_PAYMENT");
  await login(page, "support.a@proofit.test");
  await open(page, "review", c.request.id);
  await expect(
    page.getByRole("button", { name: "Review exact approval" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("A refund approver account is required.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "approver.a@proofit.test");
  await open(page, "review", c.request.id);
  await page.getByRole("button", { name: "Review exact approval" }).click();
  await expect(page.getByRole("dialog")).toContainText("MYR 20.00");
  const sent = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/api/approvals"),
  );
  await page
    .getByRole("button", { name: "Approve exact refund", exact: true })
    .click();
  expect((await sent).postDataJSON()).toEqual({
    receiptId: c.receipt.receiptId,
  });
  await expect(
    page.getByText("Approval recorded", { exact: true }),
  ).toBeVisible();
});
test("an unavailable investigation is recorded honestly and replay/reload cannot start another run", async ({
  page,
}) => {
  const c = await createCase();
  await propose(c.request.id, {
    type: "CANCEL_AT_PERIOD_END",
    subscriptionId: "sub_fixture_a",
    timing: "PERIOD_END",
  });
  await login(page, "support.a@proofit.test");
  await open(page, "review", c.request.id);
  let starts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/investigations"))
      starts++;
  });
  await page
    .getByRole("button", { name: "Investigate evidence", exact: true })
    .click();
  await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Execution log", exact: true }).click();
  await expect(
    page.getByText(
      "The investigator integration was unavailable. No model response was fabricated.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No operation recorded" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit action" })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(
    page.getByText(
      "The investigator integration was unavailable. No model response was fabricated.",
      { exact: true },
    ),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export recorded case" }).click();
  const download = await downloaded;
  const downloadedPath = await download.path();
  const packet = JSON.parse(await readFile(downloadedPath!, "utf8"));
  expect(packet.payload.visibility).toBe("STAFF");
  expect(packet.payload.recordedOnly).toBe(true);
  expect(packet.payload.investigations.length).toBe(1);
  expect(packet.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(starts).toBe(1);
  await page.getByText("recorded events", { exact: false }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".local/e2e-shots/recorded-replay.png",
    fullPage: true,
  });
});
test("signing out clears prior customer records and a second customer cannot open them", async ({
  page,
}) => {
  const c = await createCase();
  await login(page, "customer.a@proofit.test");
  await open(page, "request", c.request.id);
  await expect(page.locator(".request-quote")).toHaveText(c.text);
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "customer.b@proofit.test");
  await expect(page.locator(".queue-list")).toHaveCount(0);
  await openMissing();
  async function openMissing() {
    await page.goto("/#/request/" + c.request.id + "?version=1");
    await expect(page.getByRole("alert")).toContainText("Request not found");
    await expect(page.locator(".request-quote")).toHaveCount(0);
  }
});

test("recorded controlled outcomes distinguish verified scheduling, pending and unknown without resubmitting", async ({
  page,
}) => {
  const outcomes = JSON.parse(
    await readFile(".local/e2e-outcomes.json", "utf8"),
  ) as { requestId: string; variant: string; state: string }[];
  await login(page, "customer.a@proofit.test");
  let writes = 0;
  page.on("request", (r) => {
    if (r.method() === "POST") writes++;
  });
  for (const outcome of outcomes) {
    await open(page, "replay", outcome.requestId);
    await expect(
      page.getByText(
        "This is a controlled test record, not a live provider run.",
        { exact: true },
      ),
    ).toBeVisible();
    if (outcome.variant === "SCHEDULED") {
      await expect(
        page.getByRole("heading", {
          name: "The provider recorded renewal cancellation scheduled for the recorded period end.",
        }),
      ).toBeVisible();
      await expect(
        page.getByText("Supported by a stored observation", { exact: true }),
      ).toBeVisible();
    } else if (outcome.variant === "PENDING")
      await expect(
        page.getByRole("heading", {
          name: "The provider outcome is pending verification.",
        }),
      ).toBeVisible();
    else
      await expect(
        page.getByRole("heading", {
          name: "We are checking the request status.",
        }),
      ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit action" }),
    ).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".outcome-state")).toBeVisible();
  }
  expect(writes).toBe(0);
  const outcomeAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    outcomeAudit.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
});
test("keyboard skip/dialog focus, stored text safety and accessibility pass in light and dark modes", async ({
  page,
}) => {
  await page.goto("/");
  const loginAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    loginAudit.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await login(page, "customer.a@proofit.test");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to workspace" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  expect(new URL(page.url()).hash).not.toContain("workspace-content");
  await expect(page.locator("#workspace-content")).toBeFocused();
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page
    .getByLabel("What would you like to change?")
    .fill('<svg onload="window.proofitInjected=true">Untrusted text</svg>');
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "New request", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page
    .getByRole("button", { name: "Create request", exact: true })
    .click();
  await expect(page.locator(".request-quote")).toContainText("<svg onload=");
  expect(
    await page.evaluate(() => Object.hasOwn(window, "proofitInjected")),
  ).toBe(false);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 900 });
    await noOverflow(page);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      audit.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});

test("a canceled slow request cannot replace the newly selected case", async ({
  page,
}) => {
  const first = await createCase();
  const second = await createCase();
  await login(page, "customer.a@proofit.test");
  let release!: () => void;
  let started!: () => void;
  let finished!: () => void;
  const waiting = new Promise<void>((r) => {
    release = r;
  });
  const entered = new Promise<void>((r) => {
    started = r;
  });
  const done = new Promise<void>((r) => {
    finished = r;
  });
  await page.route(
    "**/api/requests/" + first.request.id + "?version=1",
    async (route) => {
      const response = await route.fetch();
      started();
      await waiting;
      try {
        await route.fulfill({ response });
      } catch {
      } finally {
        finished();
      }
    },
  );
  await page.goto("/#/request/" + first.request.id + "?version=1");
  await entered;
  await page.locator(".queue-item").filter({ hasText: second.text }).click();
  await expect(page.locator(".request-quote")).toHaveText(second.text);
  release();
  await done;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator(".request-quote")).toHaveText(second.text);
});

test("a late background progress response cannot replace the newly selected case", async ({ page }) => {
  const first = await createCase();
  const second = await createCase();
  await login(page, "customer.a@proofit.test");
  let reads = 0;
  let release!: () => void;
  let started!: () => void;
  let finished!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const done = new Promise<void>(resolve => { finished = resolve; });
  await page.route("**/api/requests/" + first.request.id + "?version=1", async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.automation = { ...body.automation, status: "QUEUED", message: "Synthetic queued progress." };
    if (++reads === 1) { await route.fulfill({ response, json: body }); return; }
    started();
    await waiting;
    try { await route.fulfill({ response, json: body }); } catch { /* Navigation aborted this old read. */ }
    finally { finished(); }
  });
  await open(page, "request", first.request.id);
  await entered;
  await page.locator(".queue-item").filter({ hasText: second.text }).click();
  await expect(page.locator(".request-quote")).toHaveText(second.text);
  release(); await done;
  await expect(page.locator(".request-quote")).toHaveText(second.text);
});
