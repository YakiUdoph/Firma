import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright-core";
import { independentlyVerifyReport } from "../src/independent-verifier.mjs";
import { validHistoricalSnapshot, validImportedReport } from "../test-support/report-fixtures.mjs";

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const screenshotPath = fileURLToPath(new URL("../../review-artifacts/phase-7d-check-report.png", import.meta.url));
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function waitForServer(url) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error("Local FIRMA server did not start.");
}

test("report upload works in Chrome and has no serious accessibility violations", { timeout: 30_000 }, async (t) => {
  const port = 4397;
  const server = spawn(process.execPath, ["server.mjs"], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => server.kill());
  await waitForServer(`http://127.0.0.1:${port}`);

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
  await page.route("**/api/check-report", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) }));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

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
});
