export const VERSION = "0.1.0";
export const SCHEMA_VERSION = "firma.report.v1";
export const DEFAULTS = Object.freeze({
  substrateEndpoint: "wss://test-node-v3.portaldot.dev",
  evmEndpoint: "https://test-evm-rpc-v3.portaldot.dev",
  expectedChainId: "420420777",
  assetId: "2",
  account: "0x578f0a6155551b3b7c7ff255ea7dc2b08968e380",
  timeoutMs: 15_000,
  retries: 1,
});

export const STATUS = Object.freeze({ PASS: "PASS", FAIL: "FAIL", UNKNOWN: "UNKNOWN" });

export const READ_ONLY_EVM_METHODS = Object.freeze([
  "eth_chainId",
  "web3_clientVersion",
  "eth_getBlockByNumber",
  "eth_call",
]);

export const REQUIRED_PALLETS = Object.freeze(["assets", "revive"]);

export const REQUIRED_QUERY_SURFACES = Object.freeze([
  "assets.asset",
  "assets.metadata",
  "assets.account",
  "revive.originalAccount",
]);

export const RUNTIME_CODE_STORAGE_KEY = "0x3a636f6465";

export const PORTALDOT_V3_SUPPORT_PROFILE = Object.freeze({
  id: "portaldot-v3-3002-edc03c9d",
  genesisHash: "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd",
  runtimeCodeHash: "0xedc03c9dc81d39fea5c02893cc34cf2ec898d55d7ee8f8e89eb27597a724c7c2",
  runtimeCodeHashAlgorithm: "blake2-256",
  specName: "portaldot-v3",
  specVersion: "3002",
  transactionVersion: "2",
  metadataVersion: 14,
  evmChainId: "420420777",
  requiredPallets: REQUIRED_PALLETS,
  requiredQuerySurfaces: REQUIRED_QUERY_SURFACES,
});

