import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright-core";
import { evaluateSnapshot } from "../src/evaluate.mjs";
import { independentlyVerifyReport } from "../src/independent-verifier.mjs";
import { parseImportedReportText } from "../src/report-import.mjs";
import { browserStartupTimeout, startManagedHttpServer } from "../test-support/browser-server.mjs";
import { genuineReportSnapshots } from "../test-support/fixtures.mjs";
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
  let uploadedReportText = null;
  let releaseInitialVerification;
  const initialVerificationGate = new Promise((resolve) => { releaseInitialVerification = resolve; });
  let gateInitialVerification = true;
  const hostileText = `</p><script data-injected>globalThis.__firmaInjected=true</script>`;
  const hostileBytes = Buffer.from(hostileText, "utf8").toString("hex");
  const hostileRaw = `0x${BigInt(32).toString(16).padStart(64, "0")}${BigInt(hostileBytes.length / 2).toString(16).padStart(64, "0")}${hostileBytes.padEnd(Math.ceil(hostileBytes.length / 64) * 64, "0")}`;
  const hostileReport = structuredClone(report);
  hostileReport.evidence.substrate.asset.metadata.name = hostileText;
  hostileReport.evidence.evm.calls.name.value = hostileText;
  hostileReport.evidence.evm.calls.name.raw = hostileRaw;
  hostileReport.evidence.evm.requests.find((entry) => entry.request.id === 6).response.result = hostileRaw;
  hostileReport.verdict = evaluateSnapshot(hostileReport.evidence);
  let verificationReport = hostileReport;
  await page.route("**/api/verify", async (route) => {
    if (gateInitialVerification) await initialVerificationGate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...verificationReport, requestId: "transport-only" }) });
  });
  await page.route("**/api/check-report", async (route) => {
    uploadedReportText = (await route.request().postDataJSON()).reportText;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(routedResponse) });
  });
  await page.goto(`${server.url}/`, { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Check asset" }).click();
  await page.locator("#progress").waitFor({ state: "visible" });
  assert.equal(await page.getByRole("button", { name: "Checking asset" }).isDisabled(), true);
  assert.equal(await page.getByLabel("Asset ID").isDisabled(), true);
  assert.match(await page.locator("#progress").textContent(), /collecting live evidence/i);
  gateInitialVerification = false;
  releaseInitialVerification();
  await page.getByRole("heading", { name: "Passed", exact: true }).waitFor();
  assert.match(await page.locator("#checks").textContent(), /<script data-injected>/);
  assert.equal(await page.locator("script[data-injected]").count(), 0);
  assert.equal(await page.evaluate(() => globalThis.__firmaInjected), undefined);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export evidence" }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), `firma-${verificationReport.input.assetId}-${verificationReport.completedAt.replaceAll(":", "-")}.json`);
  const downloadStream = await download.createReadStream();
  const downloadedChunks = [];
  for await (const chunk of downloadStream) downloadedChunks.push(chunk);
  const downloadedBuffer = Buffer.concat(downloadedChunks);
  const downloadedText = downloadedBuffer.toString("utf8");
  const downloadedReport = parseImportedReportText(downloadedText);
  assert.deepEqual(downloadedReport, verificationReport);
  assert.equal(Object.hasOwn(downloadedReport, "requestId"), false);

  for (const { label, overall, snapshot } of genuineReportSnapshots()) {
    verificationReport = {
      schema: "firma.report.v1",
      input: snapshot.input,
      evidence: snapshot,
      verdict: evaluateSnapshot(snapshot),
    };
    const responseFinished = page.waitForResponse((item) => item.url().includes("/api/verify"));
    await page.getByRole("button", { name: "Check asset" }).click();
    await responseFinished;
    const expectedTitle = { PASS: "Passed", FAIL: "Failed", UNKNOWN: "Couldn't verify" }[overall];
    await page.getByRole("heading", { name: expectedTitle, exact: true }).waitFor();
    assert.equal(await page.locator("#result").getAttribute("data-status"), overall, label);
    assert.equal(await page.locator("#form-error").isHidden(), true, label);
    assert.match(await page.locator("#investigation-summary").textContent(), /Report integrityConsistent/i, label);
  }

  const passWithFail = structuredClone(hostileReport);
  passWithFail.evidence.substrate.asset.supply = "9";
  passWithFail.verdict = evaluateSnapshot(passWithFail.evidence);
  passWithFail.verdict.overall = "PASS";
  const passWithUnknown = structuredClone(hostileReport);
  passWithUnknown.verdict.checks.find(({ id }) => id === "asset.supply").status = "UNKNOWN";
  passWithUnknown.verdict.counts = { PASS: 8, FAIL: 0, UNKNOWN: 1 };
  const failWithPasses = structuredClone(hostileReport);
  failWithPasses.verdict.overall = "FAIL";
  const unknownWithPasses = structuredClone(hostileReport);
  unknownWithPasses.verdict.overall = "UNKNOWN";
  const duplicateCheck = structuredClone(hostileReport);
  duplicateCheck.verdict.checks.push(structuredClone(duplicateCheck.verdict.checks[0]));
  duplicateCheck.verdict.counts.PASS += 1;
  const unknownCheck = structuredClone(hostileReport);
  unknownCheck.verdict.checks[0].id = "unexpected.check";

  const incompleteReports = [
    passWithFail,
    passWithUnknown,
    failWithPasses,
    unknownWithPasses,
    duplicateCheck,
    unknownCheck,
    {},
    { schema: "firma.report.v1", evidence: {}, verdict: { overall: "PASS", counts: { PASS: 0, FAIL: 0, UNKNOWN: 0 } } },
    { schema: "firma.report.v1", evidence: {}, verdict: { overall: "PASS", counts: {}, checks: {} } },
    {
      schema: "firma.report.v1",
      verdict: {
        overall: "PASS",
        counts: { PASS: 2, FAIL: 0, UNKNOWN: 0 },
        checks: [null, { id: 7, title: {}, status: "SURPRISE", summary: [], evidence: "missing" }],
      },
    },
  ];
  for (const incompleteReport of incompleteReports) {
    verificationReport = incompleteReport;
    const responseFinished = page.waitForResponse((item) => item.url().includes("/api/verify"));
    await page.getByRole("button", { name: "Check asset" }).click();
    await responseFinished;
    await page.getByRole("heading", { name: "Couldn't verify", exact: true }).waitFor();
    await page.locator("#form-error").waitFor({ state: "visible" });
    assert.equal(await page.locator("#result").getAttribute("data-status"), "UNKNOWN");
    assert.match(await page.locator("#form-error").textContent(), /incomplete or internally inconsistent report/i);
    assert.equal(await page.locator("#form-error").isHidden(), false);
    assert.notEqual(await page.locator("#verdict-title").textContent(), "Passed");
    assert.match(await page.locator("#evidence-json").textContent(), /"verdict"|^\{\}$/);
  }
  assert.equal(pageErrors.length, 0);
  await page.locator("#result").evaluate((element) => { element.hidden = true; });

  await assert.doesNotReject(() => page.getByRole("heading", { name: "Check a report" }).waitFor());
  await page.getByLabel("Upload report").setInputFiles({ name: download.suggestedFilename(), mimeType: "application/json", buffer: downloadedBuffer });
  await page.getByRole("button", { name: "Check evidence" }).click();
  await page.getByRole("heading", { name: "Reproduced", exact: true }).waitFor();
  assert.equal(uploadedReportText, downloadedText);
  assert.deepEqual(parseImportedReportText(uploadedReportText), downloadedReport);
  assert.equal(await page.locator("#imported-verdict").textContent(), "PASS");
  assert.equal(await page.locator("#report-result").getAttribute("data-status"), "REPRODUCED");
  assert.equal(await page.locator("#evidence-consistency").textContent(), "VALID");
  assert.equal(await page.locator("#historical-outcome").textContent(), "VERIFIED");
  assert.equal(await page.locator("#authentication-outcome").textContent(), "UNANCHORED");
  assert.match(await page.locator("#independent-summary").textContent(), /authenticity is unanchored/i);
  assert.equal(pageErrors.length, 0);

  await page.getByLabel("Upload report").focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.locator("#expected-commitment").evaluate((element) => element === document.activeElement), true);

  const accessibility = await page.evaluate(async () => globalThis.axe.run(document, { resultTypes: ["violations"] }));
  const serious = accessibility.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
  assert.deepEqual(serious.map(({ id, impact }) => ({ id, impact })), []);

  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await mobilePage.addInitScript({ path: require.resolve("axe-core/axe.min.js") });
  await mobilePage.route("**/api/verify", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(hostileReport) }));
  await mobilePage.goto(`${server.url}/`, { waitUntil: "networkidle" });
  await mobilePage.getByRole("button", { name: "Check asset" }).click();
  await mobilePage.getByRole("heading", { name: "Passed", exact: true }).waitFor();
  const horizontalOverflow = await mobilePage.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return [...document.querySelectorAll("body *")]
      .map((element) => ({
        selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.className && typeof element.className === "string" ? `.${element.className.trim().replaceAll(/\s+/g, ".")}` : ""}`,
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
      }))
      .filter(({ left, right }) => left < 0 || right > viewportWidth + 1);
  });
  assert.deepEqual(horizontalOverflow, []);
  assert.equal(await mobilePage.getByRole("heading", { name: "Check an asset" }).isVisible(), true);
  assert.equal(await mobilePage.getByRole("heading", { name: "Passed", exact: true }).isVisible(), true);
  const mobileAccessibility = await mobilePage.evaluate(async () => globalThis.axe.run(document, { resultTypes: ["violations"] }));
  assert.deepEqual(
    mobileAccessibility.violations
      .filter((violation) => ["serious", "critical"].includes(violation.impact))
      .map(({ id, impact }) => ({ id, impact })),
    [],
  );
  await mobilePage.close();

  await page.locator("#report-result").screenshot({ path: screenshotPath });

  routedResponse = structuredClone(response);
  routedResponse.independent.overall = "MISMATCH";
  routedResponse.independent.summary = "A saved claim disagrees with independently retrieved evidence.";
  routedResponse.historical.overall = "MISMATCH";
  routedResponse.historical.checks[0].status = "MISMATCH";
  routedResponse.historical.checks[0].summary = "The independently retrieved network identity disagrees with the imported claim.";
  routedResponse.historical.counts = { VERIFIED: response.historical.counts.VERIFIED - 1, MISMATCH: 1, UNAVAILABLE: 0 };
  await page.getByRole("button", { name: "Check evidence" }).click();
  await page.getByRole("heading", { name: "Mismatch", exact: true }).waitFor();
  assert.equal(await page.locator("#report-result").getAttribute("data-status"), "MISMATCH");
  assert.equal(await page.locator("#independent-symbol").textContent(), "×");
  await page.locator("#report-result").screenshot({ path: mismatchScreenshotPath });

  routedResponse = structuredClone(response);
  routedResponse.independent.overall = "UNAVAILABLE";
  routedResponse.independent.summary = "The exact historical evidence could not be retrieved or checked safely.";
  routedResponse.historical.overall = "UNAVAILABLE";
  routedResponse.historical.checks[0].status = "UNAVAILABLE";
  routedResponse.historical.checks[0].summary = "The exact historical network identity could not be retrieved safely.";
  routedResponse.historical.counts = { VERIFIED: response.historical.counts.VERIFIED - 1, MISMATCH: 0, UNAVAILABLE: 1 };
  await page.getByRole("button", { name: "Check evidence" }).click();
  await page.getByRole("heading", { name: "Unavailable", exact: true }).waitFor();
  assert.equal(await page.locator("#report-result").getAttribute("data-status"), "UNAVAILABLE");
  assert.equal(await page.locator("#independent-symbol").textContent(), "?");
  await page.locator("#report-result").screenshot({ path: unavailableScreenshotPath });
});
