import { createHash } from "node:crypto";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { DEFAULTS, EVM_ASSET_SELECTORS, READ_ONLY_EVM_METHODS, RUNTIME_CODE_STORAGE_KEY, SCHEMA_VERSION, VERSION } from "./constants.mjs";
import { assetPrecompileAddress, compactError, decodeAbiString, decodeUint256, encodeBalanceOf, numberToHex } from "./codec.mjs";
import { evaluateSnapshot } from "./evaluate.mjs";
import { boundedTimeoutMs, EvmRpcClient, RpcError, withTimeout } from "./rpc.mjs";
import { normalizeOptions } from "./validation.mjs";

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

function lifecycleOptions(lifecycle) {
  return { signal: lifecycle?.signal ?? null, deadlineAt: lifecycle?.deadlineAt ?? null };
}

function rpcWait(promise, options, label, lifecycle = null) {
  const timeoutMs = boundedTimeoutMs(options.timeoutMs, lifecycle?.deadlineAt ?? null, label);
  return withTimeout(promise, timeoutMs, label, { signal: lifecycle?.signal ?? null });
}

function throwIfCancelled(lifecycle) {
  if (lifecycle?.signal?.aborted) throw lifecycle.signal.reason ?? Object.assign(new Error("Verification was cancelled."), { name: "AbortError" });
}

export async function collectEvm(options, blockNumber, diagnostics = null, lifecycle = null) {
  throwIfCancelled(lifecycle);
  const client = new EvmRpcClient(options.evmEndpoint, { ...options, ...lifecycleOptions(lifecycle) });
  const evidence = { reachable: false, endpoint: options.evmEndpoint, identity: null, block: null, calls: {}, requests: client.history };
  try {
    diagnostics?.start("evm.identity");
    const [chainIdHex, clientVersion] = await Promise.all([
      client.call("eth_chainId"),
      client.call("web3_clientVersion"),
    ]);
    diagnostics?.end("ok");
    evidence.reachable = true;
    evidence.identity = { chainId: BigInt(chainIdHex).toString(), chainIdHex, clientVersion };
    if (blockNumber == null) return evidence;
    const blockTag = numberToHex(blockNumber);
    diagnostics?.start("evm.block");
    const block = await client.call("eth_getBlockByNumber", [blockTag, false]);
    if (!block) {
      diagnostics?.end("unavailable", "block_unavailable");
      evidence.block = { requestedNumber: String(blockNumber), available: false };
      return evidence;
    }
    diagnostics?.end("ok");
    evidence.block = { number: BigInt(block.number).toString(), hash: block.hash, requestedTag: blockTag, available: true };
    const address = assetPrecompileAddress(options.assetId);
    evidence.precompileAddress = address;
    diagnostics?.start("evm.contract_reads");
    evidence.calls = {
      totalSupply: await readEvmCall(client, address, EVM_ASSET_SELECTORS.totalSupply, blockTag, decodeUint256),
      balanceOf: await readEvmCall(client, address, encodeBalanceOf(options.account), blockTag, decodeUint256),
      name: await readEvmCall(client, address, EVM_ASSET_SELECTORS.name, blockTag, decodeAbiString),
      symbol: await readEvmCall(client, address, EVM_ASSET_SELECTORS.symbol, blockTag, decodeAbiString),
      decimals: await readEvmCall(client, address, EVM_ASSET_SELECTORS.decimals, blockTag, decodeUint256),
    };
    const allContractReadsSucceeded = Object.values(evidence.calls).every((call) => call.ok);
    diagnostics?.end(allContractReadsSucceeded ? "ok" : "partial", allContractReadsSucceeded ? null : "rpc_read_incomplete");
    return evidence;
  } catch (error) {
    diagnostics?.fail(error);
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

export async function collectRuntimeFingerprint(api, finalizedHash, options, lifecycle = null) {
  const normalizedOptions = typeof options === "number" ? { timeoutMs: options } : options;
  const blockHash = hashHex(finalizedHash);
  const [genesisResult, codeHashResult] = await Promise.allSettled([
    rpcWait(api.rpc.chain.getBlockHash(0), normalizedOptions, "Genesis-hash query", lifecycle),
    rpcWait(api.rpc.state.getStorageHash(RUNTIME_CODE_STORAGE_KEY, finalizedHash), normalizedOptions, "Finalized runtime-code hash query", lifecycle),
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

export async function closeSubstrateSession({ api = null, provider = null } = {}) {
  await Promise.allSettled([
    api ? withTimeout(Promise.resolve().then(() => api.disconnect()), 2_000, "Substrate API disconnect") : Promise.resolve(),
    provider ? withTimeout(Promise.resolve().then(() => provider.disconnect()), 2_000, "Substrate provider disconnect") : Promise.resolve(),
  ]);
}

export async function openSubstrateSession(options, {
  ApiPromiseClass = ApiPromise,
  WsProviderClass = WsProvider,
} = {}, lifecycle = null) {
  throwIfCancelled(lifecycle);
  const provider = new WsProviderClass(options.substrateEndpoint, 2_500);
  let api = null;
  let readiness = null;
  try {
    api = new ApiPromiseClass({ provider, throwOnConnect: true, noInitWarn: true });
    readiness = api.isReadyOrError;
    await rpcWait(readiness, options, "Substrate connection", lifecycle);
    return { api, provider };
  } catch (error) {
    await closeSubstrateSession({ api, provider });
    if (readiness) await withTimeout(Promise.resolve(readiness).catch(() => {}), 250, "Substrate readiness settlement").catch(() => {});
    throw error;
  }
}

export async function collectSubstrate(options, targetBlockNumber = null, diagnostics = null, lifecycle = null) {
  let session = null;
  try {
    diagnostics?.start("substrate.connection");
    session = await openSubstrateSession(options, {}, lifecycle);
    const { api } = session;
    diagnostics?.end("ok");
    diagnostics?.start("substrate.finalized_head");
    const latestFinalizedHash = await rpcWait(api.rpc.chain.getFinalizedHead(), options, "Finalized-head query", lifecycle);
    const latestFinalizedHeader = await rpcWait(api.rpc.chain.getHeader(latestFinalizedHash), options, "Finalized-head header query", lifecycle);
    diagnostics?.end("ok");
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
      : await rpcWait(api.rpc.chain.getBlockHash(targetBlockNumber), options, "Historical block-hash query", lifecycle);
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
    diagnostics?.start("substrate.runtime_metadata");
    const [header, chain, nodeName, nodeVersion, properties, runtimeVersion, metadata] = await rpcWait(Promise.all([
      api.rpc.chain.getHeader(finalizedHash), api.rpc.system.chain(), api.rpc.system.name(), api.rpc.system.version(),
      api.rpc.system.properties(), api.rpc.state.getRuntimeVersion(finalizedHash), api.rpc.state.getMetadata(finalizedHash),
    ]), options, "Substrate identity and metadata queries", lifecycle);
    diagnostics?.end("ok");
    diagnostics?.start("substrate.historical_decoration");
    const apiAt = await rpcWait(api.at(finalizedHash), options, "Historic runtime decoration", lifecycle);
    diagnostics?.end("ok");
    const pallets = metadata.asLatest.pallets.map((pallet) => pallet.name.toString().toLowerCase());
    const querySurfaces = {
      "assets.asset": Boolean(apiAt.query.assets?.asset),
      "assets.metadata": Boolean(apiAt.query.assets?.metadata),
      "assets.account": Boolean(apiAt.query.assets?.account),
      "revive.originalAccount": Boolean(apiAt.query.revive?.originalAccount),
    };
    diagnostics?.start("substrate.runtime_fingerprint");
    const fingerprint = await collectRuntimeFingerprint(api, finalizedHash, options, lifecycle);
    diagnostics?.end(fingerprint.errors ? "partial" : "ok", fingerprint.errors ? "rpc_read_incomplete" : null);
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
    diagnostics?.start("substrate.native_storage");
    const assetOption = await rpcWait(apiAt.query.assets.asset(options.assetId), options, "Native asset query", lifecycle);
    const assetExists = assetOption.isSome;
    const asset = assetExists ? assetOption.unwrap() : null;
    const metadataKey = apiAt.query.assets.metadata.key(options.assetId);
    const metadataExists = await rpcWait(storageExists(api, metadataKey, finalizedHash), options, "Native metadata-presence query", lifecycle);
    const nativeMetadata = await rpcWait(apiAt.query.assets.metadata(options.assetId), options, "Native metadata query", lifecycle);
    const mappingOption = await rpcWait(apiAt.query.revive.originalAccount(options.account), options, "Revive account-mapping query", lifecycle);
    const mappingExists = mappingOption.isSome;
    const accountId = mappingExists ? mappingOption.unwrap().toString() : null;
    let balance = { exists: false, value: null };
    let accountStorageKey = null;
    if (assetExists && accountId) {
      accountStorageKey = apiAt.query.assets.account.key(options.assetId, accountId);
      const entry = await rpcWait(apiAt.query.assets.account(options.assetId, accountId), options, "Native account-balance query", lifecycle);
      const exists = entry.isSome;
      balance = { exists, value: exists ? entry.unwrap().balance.toString() : "0", storageKey: accountStorageKey };
    }
    diagnostics?.end("ok");
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
    diagnostics?.fail(error);
    if (lifecycle?.signal?.aborted) throw lifecycle.signal.reason ?? error;
    return { reachable: false, endpoint: options.substrateEndpoint, error: compactError(error) };
  } finally {
    await closeSubstrateSession(session ?? {});
  }
}

export async function verify(input = {}, { diagnostics = null, collectSnapshotFn = collectSnapshot } = {}) {
  const startedAt = new Date().toISOString();
  const { options, snapshot } = await collectSnapshotFn(input, null, diagnostics);
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

export async function collectSnapshot(input = {}, targetBlockNumber = null, diagnostics = null, lifecycle = {}) {
  const options = normalizeOptions({ ...DEFAULTS, ...input });
  const substrateCollector = lifecycle.collectSubstrateFn ?? collectSubstrate;
  const evmCollector = lifecycle.collectEvmFn ?? collectEvm;
  const retries = targetBlockNumber === null ? 0 : Math.max(0, Math.min(1, lifecycle.substrateTimeoutRetries ?? 0));
  let substrate;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    throwIfCancelled(lifecycle);
    substrate = await substrateCollector(options, targetBlockNumber, diagnostics, lifecycle);
    if (substrate?.error?.name !== "TimeoutError" || attempt === retries) break;
    diagnostics?.retry?.("substrate.connection");
  }
  const blockNumber = targetBlockNumber ?? substrate.finalized?.number;
  throwIfCancelled(lifecycle);
  const evm = await evmCollector(options, blockNumber, diagnostics, lifecycle);
  return { options, snapshot: { input: options, substrate, evm } };
}

