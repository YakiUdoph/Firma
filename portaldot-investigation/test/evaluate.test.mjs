import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSnapshot } from "../src/evaluate.mjs";
import { matchingSnapshot } from "../test-support/fixtures.mjs";

const byId = (result, id) => result.checks.find((item) => item.id === id);

test("matching same-block values pass", () => {
  const result = evaluateSnapshot(matchingSnapshot());
  assert.equal(result.overall, "PASS");
  assert.equal(result.counts.FAIL, 0);
  assert.equal(byId(result, "asset.balance").status, "PASS");
});

test("confirmed integer mismatch fails", () => {
  const result = evaluateSnapshot(matchingSnapshot({ evm: { calls: { balanceOf: { ok: true, value: "14999999999999999999" } } } }));
  assert.equal(result.overall, "FAIL");
  assert.equal(byId(result, "asset.balance").status, "FAIL");
});

test("missing metadata on both surfaces is a supported passing state", () => {
  const missing = { ok: false, kind: "metadata-missing", error: { message: "execution reverted: Metadata not found" } };
  const result = evaluateSnapshot(matchingSnapshot({
    substrate: { asset: { metadata: { exists: false, name: null, symbol: null, decimals: null } } },
    evm: { calls: { name: missing, symbol: missing, decimals: missing } },
  }));
  assert.equal(byId(result, "asset.metadata").status, "PASS");
});

test("unexpected EVM revert is unknown, not failure", () => {
  const result = evaluateSnapshot(matchingSnapshot({ evm: { calls: { name: { ok: false, kind: "rpc-error", error: { message: "execution reverted" } } } } }));
  assert.equal(byId(result, "asset.metadata").status, "UNKNOWN");
  assert.equal(result.overall, "UNKNOWN");
});

test("unavailable endpoint is unknown", () => {
  const result = evaluateSnapshot(matchingSnapshot({ evm: { reachable: false, identity: null, block: null, calls: {}, error: { name: "TimeoutError", message: "timed out" } } }));
  assert.equal(byId(result, "network.evm").status, "UNKNOWN");
  assert.equal(result.overall, "UNKNOWN");
});

test("wrong chain ID is a confirmed failure", () => {
  const result = evaluateSnapshot(matchingSnapshot({ evm: { identity: { chainId: "1" } } }));
  assert.equal(byId(result, "identity.chainId").status, "FAIL");
  assert.equal(result.overall, "FAIL");
});

test("unsupported runtime is unknown", () => {
  const result = evaluateSnapshot(matchingSnapshot({ substrate: { runtime: { specName: "other-chain", specVersion: "1", pallets: ["assets"] } } }));
  assert.equal(byId(result, "runtime.support").status, "UNKNOWN");
  assert.equal(result.overall, "UNKNOWN");
});

test("different block contexts suppress parity conclusions", () => {
  const result = evaluateSnapshot(matchingSnapshot({ evm: { block: { number: "120901", hash: "0xother", available: true } } }));
  assert.equal(byId(result, "context.block").status, "UNKNOWN");
  assert.equal(byId(result, "asset.supply").status, "UNKNOWN");
  assert.equal(byId(result, "asset.balance").status, "UNKNOWN");
});

test("very large exact integer values are compared without floating point", () => {
  const huge = "340282366920938463463374607431768211455";
  const result = evaluateSnapshot(matchingSnapshot({ substrate: { asset: { supply: huge }, balance: { exists: true, value: huge } }, evm: { calls: { totalSupply: { ok: true, value: huge }, balanceOf: { ok: true, value: huge } } } }));
  assert.equal(byId(result, "asset.supply").status, "PASS");
  assert.equal(byId(result, "asset.balance").status, "PASS");
});

test("FAIL takes precedence over UNKNOWN", () => {
  const result = evaluateSnapshot(matchingSnapshot({
    substrate: { runtime: { specName: "other", specVersion: "1", pallets: [] } },
    evm: { identity: { chainId: "1" } },
  }));
  assert.equal(byId(result, "runtime.support").status, "UNKNOWN");
  assert.equal(byId(result, "identity.chainId").status, "FAIL");
  assert.equal(result.overall, "FAIL");
});

