import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LABEL, VERDICT_COPY, evidenceFilename, reportContext } from "../public/view-model.js";

const [html, css, client] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../public/app.js", import.meta.url), "utf8"),
]);

test("the page leads with the real verification task and primary action", () => {
  assert.match(html, /native system and its Ethereum-compatible interface/i);
  assert.ok(html.indexOf('id="verify-form"') < html.indexOf('id="method"'));
  assert.match(html, /<span class="button-label">Check asset<\/span>/);
  assert.match(html, /<label for="asset-id">Asset ID<\/label>/);
  assert.match(html, /<label for="account">Wallet address<\/label>/);
  assert.doesNotMatch(html, /READ-ONLY MODE|Run read-only verification/i);
});

test("scope is transparent without adding wallet or transaction capabilities", () => {
  assert.match(html, /cannot connect a wallet, sign, transfer, or submit a transaction/i);
  assert.match(html, /Verification, not custody/i);
  assert.doesNotMatch(html, /Connect wallet|Sign transaction|Transfer POT/i);
  assert.match(client, /method: "POST"/);
  assert.match(client, /fetch\("\/api\/verify"/);
});

test("loading, error, result, and evidence interactions are wired", () => {
  assert.match(html, /id="progress"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  assert.match(html, /id="form-error"[^>]*role="alert"/);
  assert.match(client, /function setLoading\(loading\)/);
  assert.match(client, /progress\.hidden = !loading/);
  assert.match(client, /button\.disabled = loading/);
  assert.match(client, /navigator\.clipboard\.writeText/);
  assert.match(client, /URL\.createObjectURL/);
  assert.match(client, /evidenceDetails\(item\.evidence\)/);
});

test("PASS FAIL and UNKNOWN retain distinct language and technical codes", () => {
  assert.deepEqual(LABEL, { PASS: "Passed", FAIL: "Failed", UNKNOWN: "Couldn't verify" });
  assert.match(VERDICT_COPY.PASS, /all required checks agreed/i);
  assert.match(VERDICT_COPY.FAIL, /proven difference/i);
  assert.match(VERDICT_COPY.UNKNOWN, /could not complete every required check/i);
  assert.doesNotMatch(VERDICT_COPY.UNKNOWN, /all required.*agreed/i);
  assert.match(client, /statusCode\.textContent = item\.status/);
  assert.match(css, /\.result\[data-status="UNKNOWN"\]::before/);
  assert.match(css, /repeating-linear-gradient/);
});

test("result context uses only fields supplied by the backend report", () => {
  const report = {
    completedAt: "2026-10-22T21:16:52.843Z",
    evidence: {
      substrate: {
        finalized: { number: "151221", hash: "0xsubstrate" },
        identity: { chain: "PortaldotV3 Test" },
        runtime: { specName: "portaldot-v3", specVersion: "3002", fingerprint: { runtimeCodeHash: "0xcode" } },
      },
      evm: { identity: { chainId: "420420777", chainIdHex: "0x190f1ca9" } },
    },
  };
  const items = reportContext(report);
  assert.deepEqual(items.map(({ label, value }) => ({ label, value })).slice(0, 4), [
    { label: "Finalized block", value: "151221" },
    { label: "Native chain", value: "PortaldotV3 Test" },
    { label: "Runtime", value: "portaldot-v3/3002" },
    { label: "EVM chain ID", value: "420420777" },
  ]);
  assert.equal(reportContext({})[0].value, "Unavailable");
});

test("evidence export filenames remain deterministic and sanitized", () => {
  assert.equal(evidenceFilename({ input: { assetId: "806707" }, completedAt: "2026-10-22T21:16:52.843Z" }), "firma-806707-2026-10-22T21-16-52.843Z.json");
  assert.equal(evidenceFilename({ input: { assetId: "not-valid" } }), "firma-unknown-undated.json");
});

test("the workspace provides keyboard and responsive accessibility affordances", () => {
  assert.match(html, /class="skip-link" href="#verify"/);
  assert.match(html, /aria-describedby="asset-help"/);
  assert.match(html, /aria-describedby="account-help"/);
  assert.match(html, /class="verdict-line"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /pattern="0x\[0-9a-fA-F\]\{40\}"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /@media \(max-width: 470px\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(html, /rel="icon" href="\/favicon\.svg"/);
});

test("independent report verification keeps original and reproduced results separate", () => {
  assert.match(html, /id="check-report"/);
  assert.match(html, /<label for="report-file">Upload report<\/label>/);
  assert.match(html, /<span class="button-label">Check evidence<\/span>/);
  assert.match(html, /Verified<\/strong><span>Historical evidence was reproduced/);
  assert.match(html, /Mismatch<\/strong><span>A saved claim disagrees/);
  assert.match(html, /Unavailable<\/strong><span>The exact history could not be checked safely/);
  assert.match(html, /The original report is preserved/);
  assert.match(client, /reportText: text/);
  assert.doesNotMatch(client, /eval\(|new Function/);
  assert.match(css, /\.check\[data-status="MISMATCH"\]/);
  assert.match(css, /\.check\[data-status="UNAVAILABLE"\]/);
});
