import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LABEL, VERDICT_COPY, evidenceFilename, reportContext } from "../public/view-model.js";

const [html, css, client] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../public/app.js", import.meta.url), "utf8"),
]);
const [vercelConfig, localServer, noiseAsset] = await Promise.all([
  readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  readFile(new URL("../server.mjs", import.meta.url), "utf8"),
  readFile(new URL("../public/noise.svg", import.meta.url), "utf8"),
]);

test("the page leads with the real verification task and primary action", () => {
  assert.match(html, /native system and its Ethereum-compatible interface/i);
  assert.ok(html.indexOf('id="verify-form"') < html.indexOf('id="method"'));
  assert.match(html, /<span class="button-label">Check asset<\/span>/);
  assert.match(html, /<label for="asset-id">Asset ID<\/label>/);
  assert.match(html, /<label for="account">Account address<\/label>/);
  assert.match(html, /not the asset's EVM precompile address/i);
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
    input: { assetId: "2" },
    completedAt: "2026-10-22T21:16:52.843Z",
    evidence: {
      substrate: {
        finalized: { number: "151221", hash: "0xsubstrate" },
        identity: { chain: "PortaldotV3 Test" },
        runtime: { specName: "portaldot-v3", specVersion: "3002", fingerprint: { runtimeCodeHash: "0xcode" } },
      },
      evm: { precompileAddress: "0x0000000000000000000000000000000000000002", identity: { chainId: "420420777", chainIdHex: "0x190f1ca9" } },
    },
  };
  const items = reportContext(report);
  assert.deepEqual(items.map(({ label, value }) => ({ label, value })).slice(0, 6), [
    { label: "Finalized block", value: "151221" },
    { label: "Asset ID", value: "2" },
    { label: "Asset precompile", value: "0x0000000000000000000000000000000000000002" },
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
  assert.match(html, /rel="icon" href="\/favicon\.ico"/);
  assert.match(html, /rel="icon" href="\/favicon-32\.png" type="image\/png" sizes="32x32"/);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/);
  assert.match(html, /class="brand-logo" src="\/firma-logo-header\.png"[^>]*alt=""/);
  assert.match(localServer, /"\.png": "image\/png"/);
  assert.match(localServer, /"\.ico": "image\/x-icon"/);
  assert.match(localServer, /"\.webmanifest": "application\/manifest\+json; charset=utf-8"/);
});

test("the noise texture is same-origin and compatible with deployed and local CSP", () => {
  assert.match(css, /url\(["']?\/noise\.svg["']?\)/);
  assert.doesNotMatch(css, /data:image/i);
  assert.match(noiseAsset, /<feTurbulence\b/);
  for (const policySource of [vercelConfig, localServer]) {
    assert.match(policySource, /img-src 'self'/);
    assert.doesNotMatch(policySource, /img-src[^;\r\n]*data:/);
  }
});

test("independent report verification keeps original and reproduced results separate", () => {
  assert.match(html, /id="check-report"/);
  assert.match(html, /<label for="report-file">Upload report<\/label>/);
  assert.match(html, /<span class="button-label">Check evidence<\/span>/);
  assert.match(html, /Authenticated<\/strong><span>Evidence is consistent, history reproduced/);
  assert.match(html, /Reproduced<\/strong><span>Evidence is consistent and history reproduced, but no independent trust anchor/);
  assert.match(html, /Mismatch<\/strong><span>A historical claim or supplied commitment disagrees/);
  assert.match(html, /Unavailable<\/strong><span>The exact history could not be checked safely/);
  assert.match(html, /Internal consistency, historical reproduction, and commitment authentication are reported separately/);
  assert.match(client, /response\.authentication\.status/);
  assert.match(client, /response\.reportValidation\.evidenceConsistency/);
  assert.match(client, /reportText: text/);
  assert.doesNotMatch(client, /eval\(|new Function/);
  assert.match(css, /\.check\[data-status="MISMATCH"\]/);
  assert.match(css, /\.check\[data-status="UNAVAILABLE"\]/);
});

test("investigation guidance is progressive, evidence-backed, and rendered as text", () => {
  assert.match(html, /id="investigation-summary"/);
  assert.match(html, /What matters next/);
  assert.match(client, /WHAT FIRMA OBSERVED/);
  assert.match(client, /WHAT THIS PROVES/);
  assert.match(client, /WHAT IT DOES NOT PROVE/);
  assert.match(client, /WHAT TO INVESTIGATE NEXT/);
  assert.match(client, /details\.open = item\.status !== "PASS"/);
  assert.match(client, /value\.textContent = entry\.value/);
  assert.doesNotMatch(client, /innerHTML|insertAdjacentHTML|document\.write/);
  assert.match(css, /\.investigation-guidance/);
  assert.match(css, /\.guidance-grid/);
});
