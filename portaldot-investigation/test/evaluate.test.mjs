import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSnapshot } from "../src/evaluate.mjs";
import { matchingSnapshot } from "../test-support/fixtures.mjs";

const byId = (result, id) => result.checks.find((item) => item.id === id);

test("both balances present and equal pass", () => {
  const result = evaluateSnapshot(matchingSnapshot());
  assert.equal(result.overall, "PASS");
  assert.equal(result.counts.FAIL, 0);
  assert.equal(byId(result, "asset.balance").status, "PASS");
});

test("both balances present and unequal fail", () => {
  const result = evaluateSnapshot(matchingSnapshot({ evm: { calls: { balanceOf: { ok: true, value: "14999999999999999999" } } } }));
  assert.equal(result.overall, "FAIL");
  assert.equal(byId(result, "asset.balance").status, "FAIL");
});

test("absent native balance record and EVM zero remain unknown with explicit evidence", () => {
  const result = evaluateSnapshot(matchingSnapshot({
    substrate: { balance: { exists: false, value: "0", storageKey: "0xnative-balance" } },
    evm: { calls: { balanceOf: { ok: true, value: "0", raw: "0x0" } } },
  }));
  const balance = byId(result, "asset.balance");
  assert.equal(balance.status, "UNKNOWN");
  assert.equal(balance.summary, "The EVM balance is zero, but no native balance record was found. FIRMA cannot confirm whether both balances agree.");
  assert.deepEqual(balance.evidence.native, { exists: false, value: "0", storageKey: "0xnative-balance" });
  assert.deepEqual(balance.evidence.evm, { ok: true, value: "0", raw: "0x0" });
  assert.equal(balance.evidence.sameBlock, true);
  assert.equal(balance.evidence.mapping.exists, true);
  assert.deepEqual(balance.evidence.unavailableReasons, ["native-balance-record-absent"]);
});

test("absent native balance record and nonzero EVM balance remain unknown", () => {
  const result = evaluateSnapshot(matchingSnapshot({
    substrate: { balance: { exists: false, value: "0" } },
    evm: { calls: { balanceOf: { ok: true, value: "7" } } },
  }));
  const balance = byId(result, "asset.balance");
  assert.equal(balance.status, "UNKNOWN");
  assert.equal(balance.summary, "The EVM balance is 7 base units, but no native balance record was found. FIRMA cannot confirm whether both balances agree.");
  assert.equal(balance.evidence.native.exists, false);
  assert.equal(balance.evidence.evm.value, "7");
  assert.deepEqual(balance.evidence.unavailableReasons, ["native-balance-record-absent"]);
});

test("RPC errors and missing balance observations remain unknown with explicit evidence", () => {
  const observations = [
    { ok: false, kind: "rpc-error", error: { message: "timed out" } },
    undefined,
  ];
  for (const observation of observations) {
    const snapshot = matchingSnapshot();
    snapshot.evm.calls.balanceOf = observation;
    const balance = byId(evaluateSnapshot(snapshot), "asset.balance");
    assert.equal(balance.status, "UNKNOWN");
    assert.equal(balance.summary, "A mapped, same-block balance pair was unavailable.");
    assert.deepEqual(balance.evidence.evm, observation ?? null);
    assert.equal(balance.evidence.native.exists, true);
    assert.deepEqual(balance.evidence.unavailableReasons, ["evm-balance-observation-unavailable"]);
  }
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
  assert.equal(byId(result, "asset.supply").status, "UNKNOWN");
  assert.equal(byId(result, "asset.balance").status, "UNKNOWN");
  assert.equal(result.overall, "UNKNOWN");
});

test("unknown runtime code hash suppresses dependent parity passes", () => {
  const result = evaluateSnapshot(matchingSnapshot({
    substrate: { runtime: { fingerprint: { runtimeCodeHash: `0x${"00".repeat(32)}` } } },
  }));
  assert.equal(byId(result, "runtime.support").status, "UNKNOWN");
  assert.deepEqual(byId(result, "runtime.support").evidence.mismatchReasons, ["runtimeCodeHash"]);
  for (const id of ["asset.supply", "account.mapping", "asset.balance", "asset.metadata"]) {
    assert.equal(byId(result, id).status, "UNKNOWN");
  }
});

test("wrong genesis hash is outside the support envelope", () => {
  const result = evaluateSnapshot(matchingSnapshot({
    substrate: { runtime: { fingerprint: { genesisHash: `0x${"11".repeat(32)}` } } },
  }));
  assert.equal(byId(result, "runtime.support").status, "UNKNOWN");
  assert.ok(byId(result, "runtime.support").evidence.mismatchReasons.includes("genesisHash"));
});

test("wrong or missing runtime versions are outside the support envelope", () => {
  const cases = [
    ["specName", "portaldot-v4"],
    ["specVersion", "3003"],
    ["transactionVersion", "3"],
    ["metadataVersion", 15],
  ];
  for (const [field, value] of cases) {
    const result = evaluateSnapshot(matchingSnapshot({ substrate: { runtime: { [field]: value } } }));
    assert.equal(byId(result, "runtime.support").status, "UNKNOWN", field);
    assert.ok(byId(result, "runtime.support").evidence.mismatchReasons.includes(field), field);
  }
  const snapshot = matchingSnapshot();
  delete snapshot.substrate.runtime.transactionVersion;
  const missing = evaluateSnapshot(snapshot);
  assert.equal(byId(missing, "runtime.support").status, "UNKNOWN");
  assert.ok(byId(missing, "runtime.support").evidence.mismatchReasons.includes("transactionVersion"));
});

test("missing required pallets and query surfaces are outside the support envelope", () => {
  const missingPallet = evaluateSnapshot(matchingSnapshot({ substrate: { runtime: { pallets: ["system", "assets"] } } }));
  assert.ok(byId(missingPallet, "runtime.support").evidence.mismatchReasons.includes("pallet:revive"));
  assert.equal(byId(missingPallet, "asset.supply").status, "UNKNOWN");

  const missingSurface = evaluateSnapshot(matchingSnapshot({
    substrate: { runtime: { querySurfaces: { "revive.originalAccount": false } } },
  }));
  assert.ok(byId(missingSurface, "runtime.support").evidence.mismatchReasons.includes("querySurface:revive.originalAccount"));
  assert.equal(byId(missingSurface, "asset.balance").status, "UNKNOWN");
});

test("runtime code fingerprint must be collected at the verification block", () => {
  const result = evaluateSnapshot(matchingSnapshot({
    substrate: { runtime: { fingerprint: { collectedAtBlockHash: "0xdifferent" } } },
  }));
  assert.equal(byId(result, "runtime.support").status, "UNKNOWN");
  assert.ok(byId(result, "runtime.support").evidence.mismatchReasons.includes("runtimeCodeBlockContext"));
});

test("raw metadata fallback drift remains evidence, not a runtime approval key", () => {
  const historical = evaluateSnapshot(matchingSnapshot());
  const fresh = evaluateSnapshot(matchingSnapshot({
    substrate: { runtime: { metadataSha256: "81d9a3714fc7b8b3bf3e3055d3afe8163986c93e6cf9139cde72af36d3f19053" } },
  }));
  assert.equal(byId(historical, "runtime.support").status, "PASS");
  assert.equal(byId(fresh, "runtime.support").status, "PASS");
  assert.notEqual(byId(historical, "runtime.support").evidence.metadataSha256, byId(fresh, "runtime.support").evidence.metadataSha256);
});

test("wrong profile chain ID preserves the independent confirmed failure", () => {
  const result = evaluateSnapshot(matchingSnapshot({ evm: { identity: { chainId: "1" } } }));
  assert.equal(byId(result, "identity.chainId").status, "FAIL");
  assert.equal(byId(result, "runtime.support").status, "UNKNOWN");
  assert.ok(byId(result, "runtime.support").evidence.mismatchReasons.includes("evmChainId"));
  assert.equal(result.overall, "FAIL");
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

