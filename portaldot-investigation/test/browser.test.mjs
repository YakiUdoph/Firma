import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright-core";
import { independentlyVerifyReport } from "../src/independent-verifier.mjs";
import { browserStartupTimeout, startManagedHttpServer } from "../test-support/browser-server.mjs";
import { validHistoricalSnapshot, validImportedReport } from "../test-support/report-fixtures.mjs";

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const screenshotPath = fileURLToPath(new URL("../../review-artifacts/phase-7d-check-report.png", import.meta.url));
const mismatchScreenshotPath = fileURLToPath(new URL("../../review-artifacts/phase-7e-mismatch.png", import.meta.url));
const unavailableScreenshotPath = fileURLToPath(new URL("../../review-artifacts/phase-7e-unavailable.png", import.meta.url));
const chromeCandidates = process.platform === "win32"
  ? ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]
  : process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
const chromePath = process.env.FIRMA_CHROME_PATH || chromeCandidates.find(existsSync);

test("report upload works in Chrome and has no serious accessibility violations", { timeout: 45_000 }, async (t) => {
  assert.ok(chromePath, "Chrome or Chromium is required for the browser regression test.");
  const server = await startManagedHttpServer({
    args: ["server.mjs"],
    cwd: projectRoot,
    timeoutMs: browserStartupTimeout(),
  });
  t.after(() => server.stop());

  const report = validImportedReport();
  const response = await independentlyVerifyReport({
    report,
    collectSnapshotFn: async (input) => ({ options: input, snapshot: validHistoricalSnapshot() }),
  });
  const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ["--no-sandbox"] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await page.addInitScript({ path: require.resolve("axe-core/axe.min.js") });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  let routedResponse = response;
  await page.route("**/api/check-report", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(routedResponse) }));
  await page.goto(`${server.url}/`, { waitUntil: "networkidle" });

  await assert.doesNotReject(() => page.getByRole("heading", { name: "Check a report" }).waitFor());
  await page.getByLabel("Upload report").setInputFiles({ name: "firma-report.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(report)) });
  await page.getByRole("button", { name: "Check evidence" }).click();
  await page.getByRole("heading", { name: "Verified", exact: true }).waitFor();
  assert.equal(await page.locator("#imported-verdict").textContent(), "PASS");
  assert.equal(await page.locator("#report-result").getAttribute("data-status"), "VERIFIED");
  assert.match(await page.locator("#independent-summary").textContent(), /independently reproduced/i);
  assert.equal(pageErrors.length, 0);

  await page.getByLabel("Upload report").focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.locator("#expected-commitment").evaluate((element) => element === document.activeElement), true);

  const accessibility = await page.evaluate(async () => globalThis.axe.run(document, { resultTypes: ["violations"] }));
  const serious = accessibility.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
  assert.deepEqual(serious.map(({ id, impact }) => ({ id, impact })), []);

  await page.locator("#report-result").screenshot({ path: screenshotPath });

  routedResponse = structuredClone(response);
  routedResponse.independent.overall = "MISMATCH";
  routedResponse.independent.summary = "A saved claim disagrees with independently retrieved evidence.";
  routedResponse.independent.checks[0].status = "MISMATCH";
  routedResponse.independent.checks[0].summary = "The independently retrieved network identity disagrees with the imported claim.";
  routedResponse.independent.counts = { VERIFIED: 25, MISMATCH: 1, UNAVAILABLE: 0 };
  await page.getByRole("button", { name: "Check evidence" }).click();
  await page.getByRole("heading", { name: "Mismatch", exact: true }).waitFor();
  assert.equal(await page.locator("#report-result").getAttribute("data-status"), "MISMATCH");
  assert.equal(await page.locator("#independent-symbol").textContent(), "×");
  await page.locator("#report-result").screenshot({ path: mismatchScreenshotPath });

  routedResponse = structuredClone(response);
  routedResponse.independent.overall = "UNAVAILABLE";
  routedResponse.independent.summary = "The exact historical evidence could not be retrieved or checked safely.";
  routedResponse.independent.checks[0].status = "UNAVAILABLE";
  routedResponse.independent.checks[0].summary = "The exact historical network identity could not be retrieved safely.";
  routedResponse.independent.counts = { VERIFIED: 25, MISMATCH: 0, UNAVAILABLE: 1 };
  await page.getByRole("button", { name: "Check evidence" }).click();
  await page.getByRole("heading", { name: "Unavailable", exact: true }).waitFor();
  assert.equal(await page.locator("#report-result").getAttribute("data-status"), "UNAVAILABLE");
  assert.equal(await page.locator("#independent-symbol").textContent(), "?");
  await page.locator("#report-result").screenshot({ path: unavailableScreenshotPath });
});
