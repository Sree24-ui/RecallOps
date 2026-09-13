import { test, expect } from "@playwright/test";

test("public judge has all screens and evidence downloads without owner API calls", async ({
  page,
}) => {
  const privateRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/(workspace|session|export)/.test(request.url()))
      privateRequests.push(request.url());
  });
  await page.goto("/judge");
  await expect(
    page.getByRole("heading", { name: /Follow the evidence/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Investigations", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Criteria from the notice" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Linked CPSC notice" }),
  ).toHaveAttribute("href", /cpsc.gov\/Recalls/);
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No units added" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Exports", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download evidence JSON" }).click();
  expect((await download).suggestedFilename()).toBe(
    "RecallOps-judge-evidence.json",
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Judge portal settings" }),
  ).toBeVisible();
  expect(privateRequests).toEqual([]);
});

test("judge real input path runs matcher, persists per session and clears deliberately", async ({
  page,
  browser,
}) => {
  await page.goto("/judge#inventory");
  // Synthetic inputs are isolated test records and never shipped as product data.
  for (const [name, value] of Object.entries({
    "Asset tag *": "QA-ONLY",
    "Product title *": "Regression test only",
    Brand: "INIU",
    Model: "BI-B41",
  }))
    await page.getByLabel(name, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Add unit to session" }).click();
  await page
    .getByRole("button", { name: "Investigations", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Compare 1 unit with saved notice" })
    .click();
  await expect(page.getByText("needs review", { exact: true })).toBeVisible();
  await page.getByText("QA-ONLY", { exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "missing", exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("needs review", { exact: true })).toBeVisible();
  const separate = await browser.newContext();
  const visitor = await separate.newPage();
  await visitor.goto(new URL("/judge#inventory", page.url()).href);
  await expect(
    visitor.getByRole("heading", { name: "No units added" }),
  ).toBeVisible();
  await separate.close();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Clear this session", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm clear session" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No units added" }),
  ).toBeVisible();
});

test("judge mobile screens fit the viewport and malformed uploads cannot import stale data", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/judge#inventory");
  const input = page.getByLabel("Choose inventory CSV", { exact: true });
  await input.setInputFiles({
    name: "valid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("assetTag,title\nQA-CSV,Regression test only"),
  });
  await expect(
    page.getByRole("button", { name: "Import 1 units" }),
  ).toBeVisible();
  await input.setInputFiles({
    name: "broken.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("wrong\nheader"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import 1 units" }),
  ).toHaveCount(0);
  for (const name of [
    "Overview",
    "Inventory",
    "Investigations",
    "Exports",
    "Settings",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});
