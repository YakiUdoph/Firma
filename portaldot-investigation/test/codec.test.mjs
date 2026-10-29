import assert from "node:assert/strict";
import test from "node:test";
import { decodeAbiString } from "../src/codec.mjs";
import { evaluateSnapshot } from "../src/evaluate.mjs";
import { collectEvm } from "../src/verifier.mjs";
import { matchingSnapshot } from "../test-support/fixtures.mjs";

const word = (value) => BigInt(value).toString(16).padStart(64, "0");

function encodeString(value) {
  const bytes = Buffer.from(value, "utf8");
  const padded = Math.ceil(bytes.length / 32) * 64;
  return `0x${word(32)}${word(bytes.length)}${bytes.toString("hex").padEnd(padded, "0")}`;
}

test("canonical ABI strings decode exactly", () => {
  for (const value of ["", "FIRMA", "Portaldot ✓", "x".repeat(31), "x".repeat(32), "x".repeat(33)]) {
    assert.equal(decodeAbiString(encodeString(value)), value);
  }
});

test("noncanonical ABI offsets are rejected", () => {
  const valid = encodeString("FIRMA");
  for (const offset of [0, 1, 31, 33, 64, 2n ** 255n]) {
    assert.throws(() => decodeAbiString(`0x${word(offset)}${valid.slice(66)}`), /canonical 32-byte offset/);
  }
});

test("truncated, oversized, and incorrectly sized ABI strings are rejected", () => {
  const valid = encodeString("FIRMA");
  assert.throws(() => decodeAbiString(valid.slice(0, -2)), /32-byte aligned/);
  assert.throws(() => decodeAbiString(`0x${word(32)}${word(33)}${"00".repeat(32)}`), /truncated/i);
  assert.throws(() => decodeAbiString(`${valid}${"00".repeat(32)}`), /noncanonical payload length/);
  assert.throws(() => decodeAbiString(`0x${word(32)}${word(2n ** 64n)}${"00".repeat(32)}`), /truncated/i);
});

test("invalid UTF-8 and nonzero ABI padding are rejected", () => {
  const invalidUtf8 = `0x${word(32)}${word(2)}c328${"00".repeat(30)}`;
  const invalidPadding = `0x${word(32)}${word(1)}41ff${"00".repeat(30)}`;
  assert.throws(() => decodeAbiString(invalidUtf8), /valid UTF-8/);
  assert.throws(() => decodeAbiString(invalidPadding), /nonzero padding/);
});

test("malformed ABI envelopes never decode by coercion", () => {
  for (const value of [null, "", "0x", "0x0", "0xzz", `0x${"00".repeat(31)}`]) {
    assert.throws(() => decodeAbiString(value));
  }
});

test("a malformed live-style metadata response becomes UNKNOWN rather than PASS", async () => {
  const uint = (value) => `0x${word(value)}`;
  const responses = new Map([
    [1, "0x190f1ca9"],
    [2, "test-client"],
    [3, { number: "0x1d844", hash: "0xevm" }],
    [4, uint(15_000_000_000_000_000_000n)],
    [5, uint(15_000_000_000_000_000_000n)],
    [6, `0x${word(0)}${word(5)}${Buffer.from("FIRMA").toString("hex").padEnd(64, "0")}`],
    [7, encodeString("TEST")],
    [8, uint(18)],
  ]);
  const evm = await collectEvm({
    evmEndpoint: "https://approved.example.invalid",
    assetId: "2",
    account: "0x578f0a6155551b3b7c7ff255ea7dc2b08968e380",
    timeoutMs: 1_000,
    retries: 0,
    fetchFn: async (_url, init) => {
      const request = JSON.parse(init.body);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: responses.get(request.id) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  }, "120900");
  assert.equal(evm.calls.name.ok, false);
  assert.match(evm.calls.name.error.message, /canonical 32-byte offset/);
  const verdict = evaluateSnapshot({ ...matchingSnapshot(), evm });
  assert.equal(verdict.checks.find((check) => check.id === "asset.metadata").status, "UNKNOWN");
  assert.equal(verdict.overall, "UNKNOWN");
});
