#!/usr/bin/env node

const { ApiPromise, WsProvider } = require("@polkadot/api");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const endpoint = process.argv[2] || "wss://test-node-v3.portaldot.dev";

function human(value) {
  return value?.toHuman?.() ?? value?.toJSON?.() ?? String(value);
}

function txMetadata(api, palletName, callNames) {
  const pallet = api.tx[palletName];
  if (!pallet) return null;
  return Object.fromEntries(
    callNames.filter((name) => pallet[name]).map((name) => [name, pallet[name].meta.toHuman()]),
  );
}

function constantsFor(api, palletName) {
  const constants = api.consts[palletName];
  if (!constants) return null;
  return Object.fromEntries(Object.entries(constants).map(([name, value]) => [name, human(value)]));
}

async function entries(query, limit = 20) {
  if (!query?.entries) return null;
  const all = await query.entries();
  return {
    count: all.length,
    truncated: all.length > limit,
    sample: all.slice(0, limit).map(([key, value]) => ({ key: key.toHuman(), value: human(value) })),
  };
}

(async () => {
  const provider = new WsProvider(endpoint, 2_500);
  const api = await ApiPromise.create({ provider, throwOnConnect: true });
  try {
    const at = await api.rpc.chain.getHeader();
    const assetAccountEntries = await api.query.assets.account.entries();
    const originalAccountEntries = await api.query.revive.originalAccount.entries();
    const h160ByAccountId = new Map(
      originalAccountEntries.map(([key, value]) => [value.toString(), key.args[0].toString()]),
    );
    const assetHolderMappings = assetAccountEntries.map(([key, value]) => ({
      assetId: key.args[0].toString(),
      accountId: key.args[1].toString(),
      h160: h160ByAccountId.get(key.args[1].toString()) ?? null,
      balance: value.unwrap().balance.toString(),
    }));
    const result = {
      endpoint,
      observedAt: new Date().toISOString(),
      block: { number: at.number.toString(), hash: at.hash.toHex() },
      constants: {
        balances: constantsFor(api, "balances"),
        assets: constantsFor(api, "assets"),
        revive: constantsFor(api, "revive"),
        assetsPrecompilesPermit: constantsFor(api, "assetsPrecompilesPermit"),
        vestingPrecompiles: constantsFor(api, "vestingPrecompiles"),
        metaTx: constantsFor(api, "metaTx"),
      },
      calls: {
        revive: txMetadata(api, "revive", [
          "ethTransact", "call", "instantiate", "instantiateWithCode", "ethInstantiateWithCode",
          "ethCall", "ethSubstrateCall", "uploadCode", "mapAccount", "batchMapAccounts",
          "unmapAccount", "dispatchAsFallbackAccount",
        ]),
        metaTx: txMetadata(api, "metaTx", ["dispatch"]),
        assets: txMetadata(api, "assets", ["create", "mint", "transfer", "approveTransfer", "transferApproved"]),
      },
      storage: {
        assets: await entries(api.query.assets?.asset),
        assetMetadata: await entries(api.query.assets?.metadata),
        assetAccounts: await entries(api.query.assets?.account),
        assetConversionPools: await entries(api.query.assetConversion?.pools),
        assetIndexToForeignAssetId: await entries(api.query.assetsPrecompiles?.assetIndexToForeignAssetId),
        foreignAssetIdToAssetIndex: await entries(api.query.assetsPrecompiles?.foreignAssetIdToAssetIndex),
        permitNonces: await entries(api.query.assetsPrecompilesPermit?.nonces),
        reviveOriginalAccount: await entries(api.query.revive?.originalAccount),
        reviveAccountInfo: await entries(api.query.revive?.accountInfoOf),
        assetHolderMappings,
      },
    };
    mkdirSync(join(__dirname, "raw"), { recursive: true });
    writeFileSync(join(__dirname, "raw", "state-snapshot.json"), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await api.disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
