import test from "node:test";
import assert from "node:assert/strict";
import { assetPrecompileAddress, decodeUint256 } from "../src/codec.mjs";
import { DEFAULTS } from "../src/constants.mjs";
import { normalizeOptions, parseRequestBody } from "../src/validation.mjs";

test("known Portaldot asset address formula remains deterministic", () => {
  assert.equal(assetPrecompileAddress("2"), "0x0000000200000000000000000000000000010000");
  assert.equal(assetPrecompileAddress("806707"), "0x000c4f3300000000000000000000000000010000");
});

test("uint256 decoder preserves values beyond Number.MAX_SAFE_INTEGER", () => {
  const value = (2n ** 255n) + 123456789n;
  assert.equal(decodeUint256(`0x${value.toString(16).padStart(64, "0")}`), value.toString());
});

test("malformed asset and account inputs are rejected", () => {
  assert.throws(() => normalizeOptions({ ...DEFAULTS, assetId: "-1" }), /unsigned base-10/);
  assert.throws(() => normalizeOptions({ ...DEFAULTS, assetId: "4294967296" }), /32-bit/);
  assert.throws(() => normalizeOptions({ ...DEFAULTS, account: "0x1234" }), /20-byte/);
});

test("remote plaintext endpoints and credential-bearing URLs are rejected", () => {
  assert.throws(() => normalizeOptions({ ...DEFAULTS, evmEndpoint: "http://example.com" }), /localhost/);
  assert.throws(() => normalizeOptions({ ...DEFAULTS, substrateEndpoint: "wss://user:pass@example.com" }), /credentials/);
});

test("HTTP request payloads must be JSON objects", () => {
  assert.throws(() => parseRequestBody(null), /JSON object/);
  assert.throws(() => parseRequestBody([]), /JSON object/);
  assert.deepEqual(parseRequestBody({ assetId: "2" }), { assetId: "2" });
});

