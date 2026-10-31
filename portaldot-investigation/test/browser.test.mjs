import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright-core";
import { evaluateSnapshot } from "../src/evaluate.mjs";
import { independentlyVerifyReport } from "../src/independent-verifier.mjs";
import { prepareNativeAnchor } from "../src/native-anchor.mjs";
import { prepareAnchorTransaction } from "../src/onchain-anchor.mjs";
import { browserStartupTimeout, startManagedHttpServer } from "../test-support/browser-server.mjs";
import { validHistoricalSnapshot, validImportedReport } from "../test-support/report-fixtures.mjs";

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const screenshotPath = fileURLToPath(new URL("../../review-artifacts/test-output/check-report.png", import.meta.url));
const mismatchScreenshotPath = fileURLToPath(new URL("../../review-artifacts/test-output/mismatch.png", import.meta.url));
const unavailableScreenshotPath = fileURLToPath(new URL("../../review-artifacts/test-output/unavailable.png", import.meta.url));
const chromeCandidates = process.platform === "win32"
  ? ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]
  : process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
const chromePath = process.env.FIRMA_CHROME_PATH || chromeCandidates.find(existsSync);

test("report upload, anchoring confirmation, and accessibility work in Chrome", { timeout: 75_000 }, async (t) => {
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
  await page.addInitScript(() => {
    const account = "0x2000000000000000000000000000000000000002";
    globalThis.__walletCalls = [];
    globalThis.ethereum = {
      async request(input) {
        globalThis.__walletCalls.push(input);
        const responses = {
          eth_requestAccounts: [account],
          eth_accounts: [account],
          eth_chainId: "0x190f1ca9",
          eth_getBalance: "0xde0b6b3a7640000",
          eth_estimateGas: "0x5208",
          eth_gasPrice: "0x3b9aca00",
          eth_sendTransaction: `0x${"11".repeat(32)}`,
        };
        return responses[input.method];
      },
    };
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  let routedResponse = response;
  const hostileText = `</p><script data-injected>globalThis.__firmaInjected=true</script>`;
  const hostileReport = structuredClone(report);
  hostileReport.evidence.substrate.asset.metadata.name = hostileText;
  hostileReport.evidence.evm.calls.name.value = hostileText;
  hostileReport.verdict = evaluateSnapshot(hostileReport.evidence);
  let verificationReport = hostileReport;
  await page.route("**/api/verify", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(verificationReport) }));
  await page.route("**/api/check-report", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(routedResponse) }));
  await page.route("**/native-wallet.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: `
      export async function connectSubWallet() {
        return {
          injector: { signer: { signPayload: async () => { throw new Error("signing must not be reached"); } } },
          accounts: [{ address: "5En7dwvXVjsHA8AEjWwdLNFf1TnxiiRSE3VUXiX7S9Pr4QUz", name: "Owner" }],
        };
      }
      export async function inspectNativeAnchor() {
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw new Error("Portaldot WebSocket connection attempt 2/2 timed out after 20000 ms. The Portaldot WebSocket may be unavailable or blocked; no transaction was submitted.");
      }
      export async function closeNativeInspection() {}
      export async function submitNativeAnchor() { throw new Error("signing must not be reached"); }
    `,
  }));
  let proofVerificationRequests = 0;
  await page.route("**/api/onchain-proof", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "prepare") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(prepareAnchorTransaction(JSON.parse(body.reportText), body.account)) });
    }
    if (body.action === "prepare-native") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(prepareNativeAnchor(JSON.parse(body.reportText), body.account)) });
    }
    proofVerificationRequests += 1;
    const report = JSON.parse(body.reportText);
    const preparation = prepareAnchorTransaction(report, "0x2000000000000000000000000000000000000002");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schema: "firma.anchor.v1",
        overall: "VERIFIED",
        summary: "The finalized transaction matches the preserved report.",
        report: { originalVerdict: report.verdict.overall, commitment: preparation.commitment },
        transactionHash: `0x${"11".repeat(32)}`,
        counts: { VERIFIED: 1, MISMATCH: 0, UNAVAILABLE: 0 },
        checks: [{ id: "anchor.commitment", title: "Recorded report commitment", status: "VERIFIED", summary: "The commitment matches.", evidence: {} }],
      }),
    });
  });
  const navigation = await page.goto(`${server.url}/`, { waitUntil: "networkidle" });
  const contentSecurityPolicy = navigation.headers()["content-security-policy"];
  assert.match(contentSecurityPolicy, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.doesNotMatch(contentSecurityPolicy, /(?:^|\s)'unsafe-eval'(?:\s|;|$)/);

  await page.getByRole("button", { name: "Check asset" }).click();
  await page.getByRole("heading", { name: "Passed", exact: true }).waitFor();
  assert.match(await page.locator("#checks").textContent(), /<script data-injected>/);
  assert.equal(await page.locator("script[data-injected]").count(), 0);
  assert.equal(await page.evaluate(() => globalThis.__firmaInjected), undefined);

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
    await page.getByRole("button", { name: "Check asset" }).click();
    await page.waitForFunction(() => document.querySelector("#verify-form")?.getAttribute("aria-busy") === "false");
    await page.getByRole("heading", { name: "Couldn't verify", exact: true }).waitFor();
    assert.equal(await page.locator("#result").getAttribute("data-status"), "UNKNOWN");
    assert.match(await page.locator("#form-error").textContent(), /incomplete or internally inconsistent report/i);
    assert.equal(await page.locator("#form-error").isHidden(), false);
    assert.notEqual(await page.locator("#verdict-title").textContent(), "Passed");
    assert.match(await page.locator("#evidence-json").textContent(), /"verdict"|^\{\}$/);
  }
  assert.equal(pageErrors.length, 0);
  await page.locator("#result").evaluate((element) => { element.hidden = true; });

  await assert.doesNotReject(() => page.getByRole("heading", { name: "Check a report" }).waitFor());
  await page.getByLabel("Upload report").setInputFiles({ name: "firma-report.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(report)) });
  await page.getByRole("button", { name: "Check evidence" }).click();
  await page.getByRole("heading", { name: "Verified", exact: true }).waitFor();
  assert.equal(await page.locator("#imported-verdict").textContent(), "PASS");
  assert.equal(await page.locator("#report-result").getAttribute("data-status"), "VERIFIED");
  assert.match(await page.locator("#independent-summary").textContent(), /independently reproduced/i);
  assert.equal(await page.getByRole("button", { name: "Use verified report for anchoring" }).isVisible(), true);
  await page.getByRole("button", { name: "Use verified report for anchoring" }).click();
  await page.getByRole("heading", { name: "Passed", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Save proof on Portaldot" }).isDisabled(), false);
  assert.match(await page.locator("#evidence-json").textContent(), /"firma.report.v1"/);
  assert.equal(pageErrors.length, 0);

  await page.getByRole("button", { name: "Save proof on Portaldot" }).click();
  await page.getByRole("button", { name: "Find SubWallet accounts" }).click();
  const nativeEstimate = page.getByRole("button", { name: "Verify network & estimate fee" });
  await nativeEstimate.click();
  await assert.doesNotReject(() => page.getByRole("button", { name: "Verifying network…" }).waitFor());
  assert.equal(await page.getByRole("button", { name: "Verifying network…" }).getAttribute("aria-busy"), "true");
  await page.locator("#anchor-error").filter({ hasText: /attempt 2\/2 timed out/i }).waitFor();
  assert.match(await page.locator("#anchor-error").textContent(), /no transaction was submitted/i);
  assert.match(await page.locator("#native-wallet-state").textContent(), /verification stopped/i);
  assert.equal(await page.locator("#native-confirmation").isHidden(), true);
  assert.equal(await nativeEstimate.isDisabled(), false);

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
  assert.equal(await page.getByRole("button", { name: "Use verified report for anchoring" }).isHidden(), true);
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

  verificationReport = hostileReport;
  await page.getByRole("button", { name: "Check asset" }).click();
  await page.getByRole("heading", { name: "Passed", exact: true }).waitFor();
  await page.getByRole("button", { name: "Save proof on Portaldot" }).click();
  await page.getByText("Use an EVM wallet instead").click();
  await page.getByRole("button", { name: "Connect EVM wallet & estimate" }).click();
  await page.getByText("Confirm the exact wallet request").waitFor();
  assert.match(await page.locator("#anchor-chain").textContent(), /420420777/);
  assert.equal(await page.locator("#anchor-value").textContent(), "0 tPOT (0x0)");
  assert.match(await page.locator("#anchor-fee").textContent(), /0\.21 tPOT \(21000000000000 base units\)/);
  assert.equal(await page.getByRole("button", { name: "Open wallet request" }).isDisabled(), true);
  await page.locator("#anchor-consent").check();
  await page.getByRole("button", { name: "Open wallet request" }).click();
  await page.locator("#anchor-transaction-hash").filter({ hasText: /^0x11/ }).waitFor();
  await page.locator("#anchor-result-summary").filter({ hasText: /Verified:/ }).waitFor();
  assert.equal(proofVerificationRequests, 1);
  const retriedProof = page.waitForResponse((response) => response.url().endsWith("/api/onchain-proof")
    && response.request().postDataJSON()?.action === "verify");
  await page.getByRole("button", { name: "Check proof again" }).click();
  await retriedProof;
  assert.equal(proofVerificationRequests, 2);
  assert.equal(await page.evaluate(() => globalThis.__walletCalls.filter(({ method }) => method === "eth_sendTransaction").length), 1);
  assert.equal(pageErrors.length, 0);
});
