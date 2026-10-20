export function matchingSnapshot(overrides = {}) {
  const base = {
    input: { expectedChainId: "420420777", assetId: "2", account: "0x578f0a6155551b3b7c7ff255ea7dc2b08968e380" },
    substrate: {
      reachable: true,
      identity: { chain: "PortaldotV3 Test" },
      finalized: { number: "120900", hash: "0xsubstrate" },
      runtime: { specName: "portaldot-v3", specVersion: "3002", pallets: ["system", "assets", "revive"] },
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

function merge(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return source ?? target;
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    result[key] = value && typeof value === "object" && !Array.isArray(value) ? merge(target?.[key] ?? {}, value) : value;
  }
  return result;
}
