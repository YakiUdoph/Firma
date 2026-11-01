import assert from "node:assert/strict";
import test from "node:test";
import { encodeAddress } from "@polkadot/util-crypto";
import {
  NativeWalletError,
  PORTALDOT_GENESIS_HASH,
  PORTALDOT_RUNTIME_CODE_HASH,
  connectSubWallet,
  inspectNativeAnchor,
  submitNativeAnchor,
} from "../browser/native-wallet.mjs";
import { prepareNativeAnchor } from "../src/native-anchor.mjs";
import { validImportedReport } from "../test-support/report-fixtures.mjs";

const signer = encodeAddress(new Uint8Array(32).fill(7), 42);
const transactionHash = `0x${"11".repeat(32)}`;
const blockHash = `0x${"22".repeat(32)}`;
const hex = (value) => ({ toHex: () => value });
const text = (value) => ({ toString: () => String(value) });

function extension({ accounts = [{ address: signer, name: "Owner" }], signerApi = { signPayload: async () => ({ id: 1, signature: "0x00" }) } } = {}) {
  const injector = { accounts: { get: async () => accounts }, signer: signerApi };
  return { injected: { "subwallet-js": { name: "SubWallet", enable: async () => injector } }, injector };
}

function apiFixture({ fee = "1490370847952", free = "50000000000000000", frozen = "0", runtimeCodeHash = PORTALDOT_RUNTIME_CODE_HASH, signError = null } = {}) {
  const extrinsic = {
    method: { callIndex: new Uint8Array([0, 7]) },
    paymentInfo: async () => ({ partialFee: text(fee), weight: text("weight") }),
    signAndSend: async (_address, _options, callback) => {
      if (signError) throw signError;
      queueMicrotask(() => callback({
        status: { isFinalized: true, asFinalized: hex(blockHash) },
        txHash: hex(transactionHash),
        txIndex: 0,
        events: [{ event: { section: "system", method: "ExtrinsicSuccess" } }],
      }));
      return () => {};
    },
  };
  return {
    api: {
      rpc: {
        chain: {
          getBlockHash: async () => hex(PORTALDOT_GENESIS_HASH),
          getFinalizedHead: async () => hex(blockHash),
          getHeader: async () => ({ number: text("255540") }),
          getBlock: async () => ({ block: { extrinsics: [{ hash: hex(transactionHash) }] } }),
        },
        state: {
          getRuntimeVersion: async () => ({ specName: text("portaldot-v3"), specVersion: text("3002"), transactionVersion: text("2") }),
          getStorageHash: async () => hex(runtimeCodeHash),
        },
      },
      query: { system: { account: { at: async () => ({ data: { free: text(free), frozen: text(frozen) } }) } } },
      tx: { system: { remarkWithEvent: () => extrinsic } },
    },
    extrinsic,
  };
}

test("SubWallet detection is explicit and rejects missing or unsupported extensions", async () => {
  await assert.rejects(connectSubWallet({}), (error) => error instanceof NativeWalletError && error.code === "SUBWALLET_NOT_INSTALLED");
  await assert.rejects(connectSubWallet({ "subwallet-js": { enable: async () => ({ accounts: {} }) } }), (error) => error.code === "UNSUPPORTED_SUBWALLET");
  const connected = await connectSubWallet(extension().injected);
  assert.equal(connected.accounts[0].address, signer);
});

test("native inspection verifies runtime, account, usable balance, and exact fee", async () => {
  const { injected } = extension();
  const session = await connectSubWallet(injected);
  const preparation = prepareNativeAnchor(validImportedReport(), signer);
  const { api } = apiFixture();
  const inspection = await inspectNativeAnchor(session, preparation, signer, { apiFactory: async () => api });
  assert.equal(inspection.maximumFeeBaseUnits, "1490370847952");
  assert.equal(inspection.balanceBaseUnits, "50000000000000000");
  assert.equal(inspection.callIndex, "0x0007");
});

test("wrong runtime and insufficient native funds stop before signing", async () => {
  const session = await connectSubWallet(extension().injected);
  const preparation = prepareNativeAnchor(validImportedReport(), signer);
  const wrong = apiFixture({ runtimeCodeHash: `0x${"00".repeat(32)}` });
  await assert.rejects(inspectNativeAnchor(session, preparation, signer, { apiFactory: async () => wrong.api }), (error) => error.code === "UNSUPPORTED_RUNTIME");
  const poor = apiFixture({ free: "1" });
  await assert.rejects(inspectNativeAnchor(session, preparation, signer, { apiFactory: async () => poor.api }), (error) => error.code === "INSUFFICIENT_BALANCE");
});

test("native WebSocket inspection stops after bounded connection timeouts and cleans up", async () => {
  const session = await connectSubWallet(extension().injected);
  const preparation = prepareNativeAnchor(validImportedReport(), signer);
  let connections = 0;
  let disconnections = 0;
  const providerFactory = () => ({
    connect: async () => {
      connections += 1;
      await new Promise(() => {});
    },
    disconnect: async () => { disconnections += 1; },
  });
  await assert.rejects(
    inspectNativeAnchor(session, preparation, signer, {
      providerFactory,
      apiCreate: async () => { throw new Error("must not initialize"); },
      connectionAttempts: 2,
      connectionTimeoutMs: 5,
      retryDelayMs: 0,
    }),
    (error) => error instanceof NativeWalletError
      && error.code === "NATIVE_RPC_TIMEOUT"
      && /attempt 2\/2 timed out/i.test(error.message)
      && /no transaction was submitted/i.test(error.message),
  );
  assert.equal(connections, 2);
  assert.equal(disconnections, 2);
});

test("native RPC inspection times out instead of leaving the UI await pending", async () => {
  const session = await connectSubWallet(extension().injected);
  const preparation = prepareNativeAnchor(validImportedReport(), signer);
  const { api } = apiFixture();
  api.rpc.chain.getFinalizedHead = async () => new Promise(() => {});
  await assert.rejects(
    inspectNativeAnchor(session, preparation, signer, { apiFactory: async () => api, rpcTimeoutMs: 5 }),
    (error) => error instanceof NativeWalletError
      && error.code === "NATIVE_RPC_TIMEOUT"
      && /finalized-head request timed out/i.test(error.message),
  );
});

test("native submission finalizes once, returns a sidecar, and blocks duplicates", async () => {
  const session = await connectSubWallet(extension().injected);
  const preparation = prepareNativeAnchor(validImportedReport(), signer);
  const { api } = apiFixture();
  const inspection = await inspectNativeAnchor(session, preparation, signer, { apiFactory: async () => api });
  const evidence = await submitNativeAnchor(inspection, { timeoutMs: 1_000 });
  assert.equal(evidence.transactionHash, transactionHash);
  assert.equal(evidence.blockHash, blockHash);
  assert.equal(evidence.extrinsicIndex, "0");
  await assert.rejects(submitNativeAnchor(inspection, { timeoutMs: 1_000 }), (error) => error.code === "DUPLICATE_SUBMISSION");
});

test("wallet rejection is explicit and never automatically retried", async () => {
  const rejected = Object.assign(new Error("User rejected request"), { code: 4001 });
  const session = await connectSubWallet(extension().injected);
  const preparation = prepareNativeAnchor(validImportedReport(), signer);
  const { api } = apiFixture({ signError: rejected });
  const inspection = await inspectNativeAnchor(session, preparation, signer, { apiFactory: async () => api });
  await assert.rejects(submitNativeAnchor(inspection, { timeoutMs: 1_000 }), (error) => error.code === "SIGNING_REJECTED");
  await assert.rejects(submitNativeAnchor(inspection, { timeoutMs: 1_000 }), (error) => error.code === "DUPLICATE_SUBMISSION");
});
