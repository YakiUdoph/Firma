import assert from "node:assert/strict";
import test from "node:test";
import {
  PORTALDOT_V3_CHAIN_ID_HEX,
  WalletAnchorError,
  connectWallet,
  inspectAnchorTransaction,
  submitAnchorTransaction,
} from "../public/onchain.js";

const account = "0x2000000000000000000000000000000000000002";
const hash = `0x${"ab".repeat(32)}`;
const prepared = {
  transaction: { from: account, to: account, value: "0x0", data: `0x4649524d410001${"42".repeat(32)}` },
};

function provider(responses) {
  const calls = [];
  return {
    calls,
    async request(input) {
      calls.push(input);
      const response = responses[input.method];
      if (response instanceof Error) throw response;
      return typeof response === "function" ? response(input) : response;
    },
  };
}

test("unsupported wallets and SS58 accounts fail before preparation", async () => {
  await assert.rejects(connectWallet(null), (error) => error instanceof WalletAnchorError && error.code === "UNSUPPORTED_WALLET");
  const wallet = provider({ eth_requestAccounts: ["5En7dwvXVjsHA8AEjWwdLNFf1TnxiiRSE3VUXiX7S9Pr4QUz"] });
  await assert.rejects(connectWallet(wallet), (error) => error.code === "UNSUPPORTED_ACCOUNT");
});

test("wrong chain and insufficient EVM balance stop before signing", async () => {
  const wrong = provider({ eth_chainId: "0x1" });
  await assert.rejects(inspectAnchorTransaction(wrong, prepared), (error) => error.code === "WRONG_CHAIN");
  assert.equal(wrong.calls.some(({ method }) => method === "eth_sendTransaction"), false);

  const poor = provider({
    eth_chainId: PORTALDOT_V3_CHAIN_ID_HEX,
    eth_getBalance: "0x1",
    eth_estimateGas: "0x5208",
    eth_gasPrice: "0x3b9aca00",
  });
  await assert.rejects(inspectAnchorTransaction(poor, prepared), (error) => error.code === "INSUFFICIENT_BALANCE");
  assert.equal(poor.calls.some(({ method }) => method === "eth_sendTransaction"), false);
});

test("an unreasonable EVM maximum fee is blocked even when the account is funded", async () => {
  const expensive = provider({
    eth_chainId: PORTALDOT_V3_CHAIN_ID_HEX,
    eth_getBalance: "0xffffffffffffffffffffffff",
    eth_estimateGas: "0x9143bcec26",
    eth_gasPrice: "0x6711",
  });
  await assert.rejects(inspectAnchorTransaction(expensive, prepared), (error) => error.code === "UNREASONABLE_FEE");
  assert.equal(expensive.calls.some(({ method }) => method === "eth_sendTransaction"), false);
});

test("inspection fixes the displayed maximum fee and submission sends exactly once", async () => {
  const wallet = provider({
    eth_chainId: PORTALDOT_V3_CHAIN_ID_HEX,
    eth_getBalance: "0xde0b6b3a7640000",
    eth_estimateGas: "0x5208",
    eth_gasPrice: "0x3b9aca00",
    eth_accounts: [account],
    eth_sendTransaction: hash,
  });
  const inspection = await inspectAnchorTransaction(wallet, prepared);
  assert.equal(inspection.maximumFeeBaseUnits, "21000000000000");
  assert.equal(inspection.transaction.gas, "0x5208");
  assert.equal(inspection.transaction.gasPrice, "0x3b9aca00");
  assert.equal(await submitAnchorTransaction(wallet, inspection), hash);
  assert.equal(wallet.calls.filter(({ method }) => method === "eth_sendTransaction").length, 1);
});

test("rejected and replaced transaction requests are explicit and never auto-resubmitted", async () => {
  for (const [code, expected] of [[4001, "SIGNING_REJECTED"], ["TRANSACTION_REPLACED", "TRANSACTION_REPLACED"]]) {
    const error = Object.assign(new Error("wallet response"), { code });
    const wallet = provider({ eth_chainId: PORTALDOT_V3_CHAIN_ID_HEX, eth_accounts: [account], eth_sendTransaction: error });
    await assert.rejects(submitAnchorTransaction(wallet, { chainIdHex: PORTALDOT_V3_CHAIN_ID_HEX, account, transaction: prepared.transaction }), (candidate) => candidate.code === expected);
    assert.equal(wallet.calls.filter(({ method }) => method === "eth_sendTransaction").length, 1);
  }
});

test("account or network changes after review require a fresh estimate", async () => {
  const wallet = provider({ eth_chainId: "0x1", eth_accounts: [account], eth_sendTransaction: hash });
  await assert.rejects(
    submitAnchorTransaction(wallet, { chainIdHex: PORTALDOT_V3_CHAIN_ID_HEX, account, transaction: prepared.transaction }),
    (error) => error.code === "WALLET_CONTEXT_CHANGED",
  );
  assert.equal(wallet.calls.some(({ method }) => method === "eth_sendTransaction"), false);
});
