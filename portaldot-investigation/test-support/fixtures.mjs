export function matchingSnapshot(overrides = {}) {
  const base = {
    input: { expectedChainId: "420420777", assetId: "2", account: "0x578f0a6155551b3b7c7ff255ea7dc2b08968e380" },
    substrate: {
      reachable: true,
      identity: { chain: "PortaldotV3 Test" },
      finalized: { number: "120900", hash: "0xsubstrate" },
      runtime: {
        specName: "portaldot-v3",
        specVersion: "3002",
        transactionVersion: "2",
        metadataVersion: 14,
        metadataSha256: "b364fc364072f77549c5746c63eedc7a6d65ce2d35e78e9c554454a4e8bb8a52",
        pallets: ["system", "assets", "revive"],
        querySurfaces: {
          "assets.asset": true,
          "assets.metadata": true,
          "assets.account": true,
          "revive.originalAccount": true,
        },
        fingerprint: {
          genesisHash: "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd",
          runtimeCodeHash: "0xedc03c9dc81d39fea5c02893cc34cf2ec898d55d7ee8f8e89eb27597a724c7c2",
          runtimeCodeHashAlgorithm: "blake2-256",
          runtimeCodeStorageKey: "0x3a636f6465",
          collectedAtBlockHash: "0xsubstrate",
        },
      },
      asset: { exists: true, supply: "15000000000000000000", metadata: { exists: true, name: "test asset", symbol: "TEST", decimals: "18" } },
      accountMapping: { exists: true, h160: "0x578f0a6155551b3b7c7ff255ea7dc2b08968e380", accountId: "5Grj5uKAoduL2EDfgizp2MMbURJKa4rL6Q5pGUnVhhhjhwjk" },
      balance: { exists: true, value: "15000000000000000000" },
    },
    evm: {
      reachable: true,
      identity: { chainId: "420420777" },
      block: { number: "120900", hash: "0xevm", available: true },
      calls: {
        totalSupply: { ok: true, value: "15000000000000000000" },
        balanceOf: { ok: true, value: "15000000000000000000" },
        name: { ok: true, value: "test asset" }, symbol: { ok: true, value: "TEST" }, decimals: { ok: true, value: "18" },
      },
    },
  };
  return merge(base, overrides);
}

export function genuineReportSnapshots() {
  return [
    { label: "fully supported PASS", overall: "PASS", snapshot: matchingSnapshot() },
    { label: "supported supply FAIL", overall: "FAIL", snapshot: matchingSnapshot({ substrate: { asset: { supply: "9" } } }) },
    { label: "supported balance FAIL", overall: "FAIL", snapshot: matchingSnapshot({ substrate: { balance: { value: "8" } } }) },
    { label: "supported metadata FAIL", overall: "FAIL", snapshot: matchingSnapshot({ substrate: { asset: { metadata: { symbol: "OTHER" } } } }) },
    { label: "wrong-chain FAIL", overall: "FAIL", snapshot: matchingSnapshot({ evm: { identity: { chainId: "1" } } }) },
    { label: "unsupported-runtime UNKNOWN", overall: "UNKNOWN", snapshot: matchingSnapshot({ substrate: { runtime: { specName: "unreviewed-runtime" } } }) },
    {
      label: "EVM endpoint unavailable UNKNOWN",
      overall: "UNKNOWN",
      snapshot: matchingSnapshot({
        evm: { reachable: false, identity: null, block: null, calls: {}, error: { name: "TimeoutError", message: "timed out" } },
      }),
    },
    {
      label: "missing native asset UNKNOWN",
      overall: "UNKNOWN",
      snapshot: matchingSnapshot({
        substrate: {
          asset: { exists: false, supply: null, metadata: { exists: false, name: null, symbol: null, decimals: null } },
          balance: { exists: false, value: null },
        },
      }),
    },
    {
      label: "missing Revive mapping UNKNOWN",
      overall: "UNKNOWN",
      snapshot: matchingSnapshot({
        substrate: { accountMapping: { exists: false, accountId: null }, balance: { exists: false, value: null } },
      }),
    },
    {
      label: "missing native balance UNKNOWN",
      overall: "UNKNOWN",
      snapshot: matchingSnapshot({ substrate: { balance: { exists: false, value: null } } }),
    },
    {
      label: "historical block unavailable UNKNOWN",
      overall: "UNKNOWN",
      snapshot: matchingSnapshot({
        substrate: {
          finalized: null,
          historical: { requestedNumber: "120900", available: false, finalized: true },
          runtime: null,
          asset: null,
          accountMapping: null,
          balance: null,
          error: { name: "HistoricalStateUnavailable", message: "Block 120900 is unavailable." },
        },
        evm: { block: { requestedNumber: "120900", available: false }, calls: {} },
      }),
    },
    {
      label: "RPC timeout UNKNOWN",
      overall: "UNKNOWN",
      snapshot: matchingSnapshot({
        substrate: {
          reachable: false,
          identity: null,
          finalized: null,
          runtime: null,
          asset: null,
          accountMapping: null,
          balance: null,
          error: { name: "TimeoutError", message: "Connection timed out." },
        },
        evm: { block: null, calls: {} },
      }),
    },
  ];
}

function merge(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return source ?? target;
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    result[key] = value && typeof value === "object" && !Array.isArray(value) ? merge(target?.[key] ?? {}, value) : value;
  }
  return result;
}
