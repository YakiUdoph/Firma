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

