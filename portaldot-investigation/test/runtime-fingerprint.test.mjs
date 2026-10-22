import test from "node:test";
import assert from "node:assert/strict";
import { RUNTIME_CODE_STORAGE_KEY } from "../src/constants.mjs";
import { collectRuntimeFingerprint } from "../src/verifier.mjs";

const GENESIS_HASH = "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd";
const RUNTIME_CODE_HASH = "0xedc03c9dc81d39fea5c02893cc34cf2ec898d55d7ee8f8e89eb27597a724c7c2";

const codecHash = (hex) => ({ toHex: () => hex });

test("runtime code hash is collected at the exact finalized block", async () => {
  const finalizedHash = codecHash(`0x${"22".repeat(32)}`);
  const calls = [];
  const api = {
    rpc: {
      chain: { getBlockHash: async (number) => { calls.push(["genesis", number]); return codecHash(GENESIS_HASH); } },
      state: { getStorageHash: async (...args) => { calls.push(["code", ...args]); return codecHash(RUNTIME_CODE_HASH); } },
    },
  };
  const fingerprint = await collectRuntimeFingerprint(api, finalizedHash, 1_000);
  assert.deepEqual(calls[0], ["genesis", 0]);
  assert.equal(calls[1][0], "code");
  assert.equal(calls[1][1], RUNTIME_CODE_STORAGE_KEY);
  assert.equal(calls[1][2], finalizedHash);
  assert.equal(fingerprint.collectedAtBlockHash, finalizedHash.toHex());
  assert.equal(fingerprint.runtimeCodeHash, RUNTIME_CODE_HASH);
});

test("missing and invalid fingerprint observations remain explicit", async () => {
  const finalizedHash = codecHash(`0x${"33".repeat(32)}`);
  const api = {
    rpc: {
      chain: { getBlockHash: async () => codecHash("0xinvalid") },
      state: { getStorageHash: async () => { throw new Error("RPC unavailable"); } },
    },
  };
  const fingerprint = await collectRuntimeFingerprint(api, finalizedHash, 1_000);
  assert.equal(fingerprint.genesisHash, null);
  assert.equal(fingerprint.runtimeCodeHash, null);
  assert.equal(fingerprint.errors.genesisHash.name, "InvalidFingerprint");
  assert.match(fingerprint.errors.runtimeCodeHash.message, /RPC unavailable/);
});
