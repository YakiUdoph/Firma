import { evaluateSnapshot } from "../src/evaluate.mjs";

export const BLOCK_NUMBER = "121096";
export const SUBSTRATE_HASH = "0xa84e7a52830c9c469c2e01f8c029ebe2ff5818d8ab9bda13412fc6d47601fab8";
export const EVM_HASH = "0x97e7794f0755fedbd3f7fd8f5f899f701485b3c2a8eaa4487a4f19c65fa6fd28";
export const GENESIS_HASH = "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd";
export const CODE_HASH = "0xedc03c9dc81d39fea5c02893cc34cf2ec898d55d7ee8f8e89eb27597a724c7c2";
export const ACCOUNT = "0x578f0a6155551b3b7c7ff255ea7dc2b08968e380";
export const ACCOUNT_ID = "5Grj5uKAoduL2EDfgizp2MMbURJKa4rL6Q5pGUnVhhhjhwjk";
export const PRECOMPILE = "0x0000000200000000000000000000000000010000";
export const SUPPLY = "15000000000000000000";

export function validHistoricalSnapshot() {
  return {
    input: {
      substrateEndpoint: "wss://trusted.example",
      evmEndpoint: "https://trusted.example",
      expectedChainId: "420420777",
      assetId: "2",
      account: ACCOUNT,
      timeoutMs: 15_000,
      retries: 1,
    },
    substrate: {
      reachable: true,
      endpoint: "wss://trusted.example",
      identity: {
        chain: "PortaldotV3 Test",
        nodeName: "PortaldotV3 Node",
        nodeVersion: "3.0.0",
        properties: { isEthereum: false, ss58Format: 42, tokenDecimals: [14], tokenSymbol: ["tPOT"] },
      },
      finalized: { number: BLOCK_NUMBER, hash: SUBSTRATE_HASH },
      latestFinalized: { number: "158174", hash: `0x${"99".repeat(32)}` },
      historical: { requestedNumber: BLOCK_NUMBER, available: true, finalized: true },
      runtime: {
        specName: "portaldot-v3",
        specVersion: "3002",
        transactionVersion: "2",
        metadataVersion: 14,
        metadataSha256: "b364fc364072f77549c5746c63eedc7a6d65ce2d35e78e9c554454a4e8bb8a52",
        pallets: ["assets", "revive"],
        querySurfaces: { "assets.asset": true, "assets.metadata": true, "assets.account": true, "revive.originalAccount": true },
        fingerprint: {
          genesisHash: GENESIS_HASH,
          runtimeCodeHash: CODE_HASH,
          runtimeCodeHashAlgorithm: "blake2-256",
          runtimeCodeStorageKey: "0x3a636f6465",
          collectedAtBlockHash: SUBSTRATE_HASH,
        },
      },
      asset: {
        exists: true,
        id: "2",
        storageKey: "0xaa",
        supply: SUPPLY,
        metadata: { exists: true, storageKey: "0xbb", name: "test asset", symbol: "TEST", decimals: "18" },
      },
      accountMapping: { exists: true, h160: ACCOUNT, accountId: ACCOUNT_ID, storageKey: "0xcc" },
      balance: { exists: true, value: SUPPLY, storageKey: "0xdd" },
    },
    evm: {
      reachable: true,
      endpoint: "https://trusted.example",
      identity: { chainId: "420420777", chainIdHex: "0x190f1ca9", clientVersion: "fixture" },
      block: { number: BLOCK_NUMBER, hash: EVM_HASH, requestedTag: "0x1d908", available: true },
      calls: {
        totalSupply: { ok: true, value: SUPPLY, raw: "0x01" },
        balanceOf: { ok: true, value: SUPPLY, raw: "0x01" },
        name: { ok: true, value: "test asset", raw: "0x01" },
        symbol: { ok: true, value: "TEST", raw: "0x01" },
        decimals: { ok: true, value: "18", raw: "0x01" },
      },
      requests: [],
      precompileAddress: PRECOMPILE,
    },
  };
}

export function validImportedReport() {
  const evidence = validHistoricalSnapshot();
  evidence.substrate.latestFinalized = { ...evidence.substrate.finalized };
  delete evidence.substrate.historical;
  return {
    schema: "firma.report.v1",
    tool: {
      name: "FIRMA",
      version: "0.1.0",
      mode: "read-only",
      allowedEvmMethods: ["eth_chainId", "web3_clientVersion", "eth_getBlockByNumber", "eth_call"],
    },
    startedAt: "2026-10-20T18:53:03.952Z",
    completedAt: "2026-10-20T18:53:18.344Z",
    input: { expectedChainId: "420420777", assetId: "2", account: ACCOUNT },
    verdict: evaluateSnapshot(evidence),
    evidence,
    limitations: ["Fixture report for deterministic tests."],
  };
}

export function clone(value) {
  return structuredClone(value);
}
