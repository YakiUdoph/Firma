import { createHash } from "node:crypto";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { DEFAULTS, READ_ONLY_EVM_METHODS, RUNTIME_CODE_STORAGE_KEY, SCHEMA_VERSION, VERSION } from "./constants.mjs";
import { assetPrecompileAddress, compactError, decodeAbiString, decodeUint256, encodeBalanceOf, numberToHex } from "./codec.mjs";
import { evaluateSnapshot } from "./evaluate.mjs";
import { EvmRpcClient, RpcError, withTimeout } from "./rpc.mjs";
import { normalizeOptions } from "./validation.mjs";

const SELECTORS = Object.freeze({ name: "0x06fdde03", symbol: "0x95d89b41", decimals: "0x313ce567", totalSupply: "0x18160ddd" });

function metadataMissing(error) {
  return error instanceof RpcError && /metadata not found/i.test(JSON.stringify(error.detail));
}

async function readEvmCall(client, to, data, blockTag, decoder) {
  try {
    const raw = await client.call("eth_call", [{ to, data }, blockTag]);
    return { ok: true, value: decoder(raw), raw };
  } catch (error) {
    return { ok: false, kind: metadataMissing(error) ? "metadata-missing" : "rpc-error", error: compactError(error), rpcError: error.detail };
  }
}

export async function collectEvm(options, blockNumber) {
  const client = new EvmRpcClient(options.evmEndpoint, options);
  const evidence = { reachable: false, endpoint: options.evmEndpoint, identity: null, block: null, calls: {}, requests: client.history };
  try {
    const [chainIdHex, clientVersion] = await Promise.all([
      client.call("eth_chainId"),
      client.call("web3_clientVersion"),
    ]);
    evidence.reachable = true;
    evidence.identity = { chainId: BigInt(chainIdHex).toString(), chainIdHex, clientVersion };
    if (blockNumber == null) return evidence;
    const blockTag = numberToHex(blockNumber);
    const block = await client.call("eth_getBlockByNumber", [blockTag, false]);
    if (!block) {
      evidence.block = { requestedNumber: String(blockNumber), available: false };
      return evidence;
    }
    evidence.block = { number: BigInt(block.number).toString(), hash: block.hash, requestedTag: blockTag, available: true };
    const address = assetPrecompileAddress(options.assetId);
    evidence.precompileAddress = address;
    evidence.calls = {
      totalSupply: await readEvmCall(client, address, SELECTORS.totalSupply, blockTag, decodeUint256),
      balanceOf: await readEvmCall(client, address, encodeBalanceOf(options.account), blockTag, decodeUint256),
      name: await readEvmCall(client, address, SELECTORS.name, blockTag, decodeAbiString),
      symbol: await readEvmCall(client, address, SELECTORS.symbol, blockTag, decodeAbiString),
      decimals: await readEvmCall(client, address, SELECTORS.decimals, blockTag, decodeUint256),
    };
    return evidence;
  } catch (error) {
    evidence.error = compactError(error);
    return evidence;
  }
}

async function storageExists(api, key, hash) {
  const value = await api.rpc.state.getStorage(key, hash);
  return Boolean(value?.isSome ?? (value && value.toHex?.() !== "0x"));
}

function hashHex(value) {
  const hex = typeof value === "string" ? value : value?.toHex?.();
  return typeof hex === "string" && /^0x[0-9a-f]{64}$/i.test(hex) ? hex.toLowerCase() : null;
}

export async function collectRuntimeFingerprint(api, finalizedHash, timeoutMs) {
  const blockHash = hashHex(finalizedHash);
  const [genesisResult, codeHashResult] = await Promise.allSettled([
    withTimeout(api.rpc.chain.getBlockHash(0), timeoutMs, "Genesis-hash query"),
    withTimeout(api.rpc.state.getStorageHash(RUNTIME_CODE_STORAGE_KEY, finalizedHash), timeoutMs, "Finalized runtime-code hash query"),
  ]);
  const errors = {};
  const genesisHash = genesisResult.status === "fulfilled" ? hashHex(genesisResult.value) : null;
  const runtimeCodeHash = codeHashResult.status === "fulfilled" ? hashHex(codeHashResult.value) : null;
  if (genesisResult.status === "rejected") errors.genesisHash = compactError(genesisResult.reason);
  else if (!genesisHash) errors.genesisHash = { name: "InvalidFingerprint", message: "Genesis hash was missing or invalid." };
  if (codeHashResult.status === "rejected") errors.runtimeCodeHash = compactError(codeHashResult.reason);
  else if (!runtimeCodeHash) errors.runtimeCodeHash = { name: "InvalidFingerprint", message: "Runtime-code hash was missing or invalid." };
  return {
    genesisHash,
    runtimeCodeHash,
    runtimeCodeHashAlgorithm: "blake2-256",
    runtimeCodeStorageKey: RUNTIME_CODE_STORAGE_KEY,
    collectedAtBlockHash: blockHash,
    ...(Object.keys(errors).length ? { errors } : {}),
  };
}

export async function collectSubstrate(options, targetBlockNumber = null) {
  const provider = new WsProvider(options.substrateEndpoint, 2_500);
  let api;
  try {
    api = await withTimeout(ApiPromise.create({ provider, throwOnConnect: true, noInitWarn: true }), options.timeoutMs, "Substrate connection");
    const latestFinalizedHash = await withTimeout(api.rpc.chain.getFinalizedHead(), options.timeoutMs, "Finalized-head query");
    const latestFinalizedHeader = await withTimeout(api.rpc.chain.getHeader(latestFinalizedHash), options.timeoutMs, "Finalized-head header query");
    const latestFinalized = { number: latestFinalizedHeader.number.toString(), hash: latestFinalizedHash.toHex() };
    if (targetBlockNumber !== null && BigInt(targetBlockNumber) > BigInt(latestFinalized.number)) {
      return {
        reachable: true,
        endpoint: options.substrateEndpoint,
        finalized: null,
        latestFinalized,
        historical: { requestedNumber: String(targetBlockNumber), available: false, finalized: false },
        error: {
          name: "HistoricalFinalityUnavailable",
          message: `Block ${targetBlockNumber} is newer than finalized block ${latestFinalized.number}.`,
        },
      };
    }
    const finalizedHash = targetBlockNumber === null
      ? latestFinalizedHash
      : await withTimeout(api.rpc.chain.getBlockHash(targetBlockNumber), options.timeoutMs, "Historical block-hash query");
    const finalizedHashHex = hashHex(finalizedHash);
    if (!finalizedHashHex || /^0x0{64}$/i.test(finalizedHashHex)) {
      return {
        reachable: true,
        endpoint: options.substrateEndpoint,
        finalized: null,
        latestFinalized,
        historical: { requestedNumber: String(targetBlockNumber), available: false, finalized: true },
        error: { name: "HistoricalStateUnavailable", message: `Block ${targetBlockNumber} is not available from the Substrate endpoint.` },
      };
    }
    const [header, chain, nodeName, nodeVersion, properties, runtimeVersion, metadata] = await withTimeout(Promise.all([
      api.rpc.chain.getHeader(finalizedHash), api.rpc.system.chain(), api.rpc.system.name(), api.rpc.system.version(),
      api.rpc.system.properties(), api.rpc.state.getRuntimeVersion(finalizedHash), api.rpc.state.getMetadata(finalizedHash),
    ]), options.timeoutMs, "Substrate identity and metadata queries");
    const apiAt = await withTimeout(api.at(finalizedHash), options.timeoutMs, "Historic runtime decoration");
    const pallets = metadata.asLatest.pallets.map((pallet) => pallet.name.toString().toLowerCase());
    const querySurfaces = {
      "assets.asset": Boolean(apiAt.query.assets?.asset),
      "assets.metadata": Boolean(apiAt.query.assets?.metadata),
      "assets.account": Boolean(apiAt.query.assets?.account),
      "revive.originalAccount": Boolean(apiAt.query.revive?.originalAccount),
    };
    const fingerprint = await collectRuntimeFingerprint(api, finalizedHash, options.timeoutMs);
    const metadataHex = metadata.toHex();
    const runtime = {
      specName: runtimeVersion.specName.toString(), specVersion: runtimeVersion.specVersion.toString(),
      transactionVersion: runtimeVersion.transactionVersion.toString(), metadataVersion: metadata.version,
      metadataSha256: createHash("sha256").update(Buffer.from(metadataHex.slice(2), "hex")).digest("hex"),
      pallets, querySurfaces, fingerprint,
    };
    if (Object.values(querySurfaces).some((available) => !available)) {
      return {
        reachable: true,
        endpoint: options.substrateEndpoint,
        identity: { chain: chain.toString(), nodeName: nodeName.toString(), nodeVersion: nodeVersion.toString(), properties: properties.toJSON() },
        finalized: { number: header.number.toString(), hash: finalizedHashHex },
        latestFinalized,
        historical: targetBlockNumber === null ? undefined : { requestedNumber: String(targetBlockNumber), available: true, finalized: true },
        runtime,
        asset: { exists: false, unsupportedRuntime: true },
        accountMapping: { exists: false, unsupportedRuntime: true },
        balance: { exists: false, value: null },
      };
    }
    const assetOption = await withTimeout(apiAt.query.assets.asset(options.assetId), options.timeoutMs, "Native asset query");
    const assetExists = assetOption.isSome;
    const asset = assetExists ? assetOption.unwrap() : null;
    const metadataKey = apiAt.query.assets.metadata.key(options.assetId);
    const metadataExists = await withTimeout(storageExists(api, metadataKey, finalizedHash), options.timeoutMs, "Native metadata-presence query");
    const nativeMetadata = await withTimeout(apiAt.query.assets.metadata(options.assetId), options.timeoutMs, "Native metadata query");
    const mappingOption = await withTimeout(apiAt.query.revive.originalAccount(options.account), options.timeoutMs, "Revive account-mapping query");
    const mappingExists = mappingOption.isSome;
    const accountId = mappingExists ? mappingOption.unwrap().toString() : null;
    let balance = { exists: false, value: null };
    let accountStorageKey = null;
    if (assetExists && accountId) {
      accountStorageKey = apiAt.query.assets.account.key(options.assetId, accountId);
      const entry = await withTimeout(apiAt.query.assets.account(options.assetId, accountId), options.timeoutMs, "Native account-balance query");
      const exists = entry.isSome;
      balance = { exists, value: exists ? entry.unwrap().balance.toString() : "0", storageKey: accountStorageKey };
    }
    return {
      reachable: true,
      endpoint: options.substrateEndpoint,
      identity: { chain: chain.toString(), nodeName: nodeName.toString(), nodeVersion: nodeVersion.toString(), properties: properties.toJSON() },
      finalized: { number: header.number.toString(), hash: finalizedHashHex },
      latestFinalized,
      historical: targetBlockNumber === null ? undefined : { requestedNumber: String(targetBlockNumber), available: true, finalized: true },
      runtime,
      asset: {
        exists: assetExists, id: options.assetId, storageKey: apiAt.query.assets.asset.key(options.assetId),
        supply: assetExists ? asset.supply.toString() : null,
        metadata: {
          exists: metadataExists, storageKey: metadataKey,
          name: metadataExists ? nativeMetadata.name.toUtf8() : null,
          symbol: metadataExists ? nativeMetadata.symbol.toUtf8() : null,
          decimals: metadataExists ? nativeMetadata.decimals.toString() : null,
        },
      },
      accountMapping: { exists: mappingExists, h160: options.account, accountId, storageKey: apiAt.query.revive.originalAccount.key(options.account) },
      balance,
    };
  } catch (error) {
    return { reachable: false, endpoint: options.substrateEndpoint, error: compactError(error) };
  } finally {
    if (api) await withTimeout(api.disconnect(), 2_000, "Substrate disconnect").catch(() => {});
    else await withTimeout(provider.disconnect(), 2_000, "Substrate provider disconnect").catch(() => {});
  }
}

export async function verify(input = {}) {
  const startedAt = new Date().toISOString();
  const { options, snapshot } = await collectSnapshot(input);
  const verdict = evaluateSnapshot(snapshot);
  return {
    schema: SCHEMA_VERSION,
    tool: { name: "FIRMA", version: VERSION, mode: "read-only", allowedEvmMethods: READ_ONLY_EVM_METHODS },
    startedAt,
    completedAt: new Date().toISOString(),
    input: { expectedChainId: options.expectedChainId, assetId: options.assetId, account: options.account },
    verdict,
    evidence: snapshot,
    limitations: [
      "This report proves only the listed reads at the pinned block; it does not prove write, event, permit, or fee behavior.",
      "The asset-precompile address rule is supported only for the verified Portaldot V3 runtime envelope.",
      "An unavailable endpoint, unsupported runtime, missing mapping, timeout, or unavailable historical block is UNKNOWN—not FAIL.",
    ],
  };
}

export async function collectSnapshot(input = {}, targetBlockNumber = null) {
  const options = normalizeOptions({ ...DEFAULTS, ...input });
  const substrate = await collectSubstrate(options, targetBlockNumber);
  const blockNumber = targetBlockNumber ?? substrate.finalized?.number;
  const evm = await collectEvm(options, blockNumber);
  return { options, snapshot: { input: options, substrate, evm } };
}

