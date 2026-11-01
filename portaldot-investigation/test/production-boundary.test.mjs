import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const productionEntries = [
  new URL("../api/verify.mjs", import.meta.url),
  new URL("../api/check-report.mjs", import.meta.url),
  new URL("../api/onchain-proof.mjs", import.meta.url),
  new URL("../server.mjs", import.meta.url),
];

test("production server routes cannot sign, broadcast, or deploy", async () => {
  const sources = (await Promise.all(productionEntries.map((url) => readFile(url, "utf8")))).join("\n");
  for (const forbidden of [
    "proof-transaction.mjs",
    "submitReportCommitment",
    "sendTransaction",
    "eth_sendRawTransaction",
    "build-contract.mjs",
    "estimate-deployment.mjs",
  ]) {
    assert.doesNotMatch(sources, new RegExp(forbidden.replaceAll(".", "\\.")));
  }

  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(vercel.functions).sort(), ["api/check-report.mjs", "api/onchain-proof.mjs", "api/verify.mjs"]);
});

test("broadcast calls live only in separately confirmed browser wallet modules", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const wallet = await readFile(new URL("../public/onchain.js", import.meta.url), "utf8");
  const nativeWallet = await readFile(new URL("../browser/native-wallet.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(app, /eth_sendRawTransaction|privateKey|recovery phrase|seed phrase/i);
  assert.match(wallet, /method: "eth_sendTransaction"/);
  assert.doesNotMatch(wallet, /eth_sendRawTransaction|privateKey|signed raw/i);
  assert.match(nativeWallet, /\.signAndSend\(/);
  assert.doesNotMatch(nativeWallet, /privateKey|recovery phrase|seed phrase|signed raw/i);
  assert.match(app, /anchor-consent/);
  assert.match(app, /submitAnchorTransaction/);
  assert.match(app, /native-consent/);
  assert.match(app, /submitNativeAnchor/);
});

test("the decorative texture is a same-origin production asset allowed by the restrictive CSP", async () => {
  const [css, texture, configurationText] = await Promise.all([
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../public/noise.svg", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  ]);
  const configuration = JSON.parse(configurationText);
  const contentSecurityPolicy = configuration.headers
    .flatMap(({ headers = [] }) => headers)
    .find(({ key }) => key.toLowerCase() === "content-security-policy")?.value;

  assert.match(css, /background-image:\s*url\("\/noise\.svg"\)/);
  assert.doesNotMatch(css, /url\(["']?data:/i);
  assert.match(texture, /<svg\s+viewBox="0 0 180 180"/);
  assert.match(texture, /<feTurbulence\s+type="fractalNoise"\s+baseFrequency="\.72"\s+numOctaves="3"\s+stitchTiles="stitch"\/>/);
  assert.match(contentSecurityPolicy ?? "", /(?:^|;\s*)img-src 'self'(?:;|$)/);
  assert.doesNotMatch(contentSecurityPolicy ?? "", /img-src[^;]*(?:data:|\*|'unsafe-inline')/);
});
