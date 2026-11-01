import { ApiPromise, WsProvider } from "@polkadot/api";
import { u8aEq, u8aToHex } from "@polkadot/util";
import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";

export const PORTALDOT_NATIVE_ENDPOINT = "wss://test-node-v3.portaldot.dev";
export const PORTALDOT_GENESIS_HASH = "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd";
export const PORTALDOT_RUNTIME_CODE_HASH = "0xedc03c9dc81d39fea5c02893cc34cf2ec898d55d7ee8f8e89eb27597a724c7c2";
export const PORTALDOT_RUNTIME = Object.freeze({ specName: "portaldot-v3", specVersion: "3002", transactionVersion: "2" });
export const NATIVE_ANCHOR_SCHEMA = "firma.anchor.native.v1";
export const NATIVE_ANCHOR_PROTOCOL = "FIRMA_NATIVE_REMARK_V1";
export const NATIVE_CONNECTION_ATTEMPTS = 2;
export const NATIVE_CONNECTION_TIMEOUT_MS = 20_000;
export const NATIVE_RPC_TIMEOUT_MS = 12_000;

const submittedInspections = new WeakSet();

export class NativeWalletError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "NativeWalletError";
    this.code = code;
  }
}

function normalizeAddress(value) {
  try {
    const publicKey = decodeAddress(value);
    if (publicKey.length !== 32) throw new Error("Unexpected account length");
    return encodeAddress(publicKey, 42);
  } catch {
    throw new NativeWalletError("INVALID_ACCOUNT", "SubWallet returned an invalid native account.");
  }
}

function sameAccount(left, right) {
  try { return u8aEq(decodeAddress(left), decodeAddress(right)); } catch { return false; }
}

function asError(error, fallback) {
  if (error instanceof NativeWalletError) return error;
  if (error?.code === 4001 || error?.message?.toLowerCase?.().includes("rejected")) {
    return new NativeWalletError("SIGNING_REJECTED", "The SubWallet request was rejected. FIRMA did not retry or resubmit it.", { cause: error });
  }
  return new NativeWalletError("NATIVE_WALLET_ERROR", fallback, { cause: error });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withNativeTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new NativeWalletError(
        "NATIVE_RPC_TIMEOUT",
        `${label} timed out after ${timeoutMs} ms. The Portaldot WebSocket may be unavailable or blocked; no transaction was submitted.`,
      )), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function connectNativeApi({
  endpoint,
  signer,
  providerFactory,
  apiCreate,
  attempts,
  timeoutMs,
  retryDelayMs,
}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const provider = providerFactory(endpoint);
    let api;
    try {
      await withNativeTimeout(provider.connect(), timeoutMs, `Portaldot WebSocket connection attempt ${attempt}/${attempts}`);
      api = await withNativeTimeout(
        apiCreate({ provider, signer, throwOnConnect: true, noInitWarn: true }),
        timeoutMs,
        `Portaldot runtime initialization attempt ${attempt}/${attempts}`,
      );
      return { api, provider };
    } catch (error) {
      lastError = error;
      if (api) await api.disconnect().catch(() => {});
      else await provider.disconnect().catch(() => {});
      if (attempt < attempts) await delay(retryDelayMs);
    }
  }
  if (lastError instanceof NativeWalletError) throw lastError;
  throw new NativeWalletError(
    "NATIVE_RPC_UNAVAILABLE",
    `FIRMA could not connect to the Portaldot WebSocket after ${attempts} bounded attempts. ${lastError?.message ?? "No connection error was provided."} No transaction was submitted.`,
    { cause: lastError },
  );
}

function findSubWalletProviders(injected = globalThis.injectedWeb3) {
  if (!injected || typeof injected !== "object") return [];
  return Object.entries(injected).filter(([id, provider]) => /subwallet/i.test(`${id} ${provider?.name ?? ""} ${provider?.version ?? ""}`));
}

export async function connectSubWallet(injected = globalThis.injectedWeb3) {
  const candidates = findSubWalletProviders(injected);
  if (candidates.length === 0) {
    throw new NativeWalletError("SUBWALLET_NOT_INSTALLED", "SubWallet was not detected. Install or unlock the SubWallet extension, then try again.");
  }
  const [extensionId, provider] = candidates[0];
  let injector;
  try {
    injector = await provider.enable("FIRMA");
  } catch (error) {
    throw asError(error, "SubWallet could not authorize FIRMA to view native accounts.");
  }
  if (!injector?.accounts?.get || !injector?.signer?.signPayload) {
    throw new NativeWalletError("UNSUPPORTED_SUBWALLET", "This SubWallet connection does not expose the account and payload-signing interfaces FIRMA requires.");
  }
  let accounts;
  try {
    accounts = await injector.accounts.get();
  } catch (error) {
    throw asError(error, "SubWallet accounts could not be read.");
  }
  const normalized = (Array.isArray(accounts) ? accounts : []).flatMap((account) => {
    try {
      return [{
        address: normalizeAddress(account.address),
        name: typeof account.name === "string" && account.name.trim() ? account.name.trim() : "SubWallet account",
        genesisHash: typeof account.genesisHash === "string" ? account.genesisHash.toLowerCase() : null,
        type: account.type ?? null,
      }];
    } catch {
      return [];
    }
  });
  if (normalized.length === 0) throw new NativeWalletError("NO_NATIVE_ACCOUNT", "SubWallet did not expose a usable 32-byte native account.");
  return { extensionId, injector, accounts: normalized };
}

async function runtimeIdentity(api, blockHash) {
  const [genesis, runtime, codeHash] = await Promise.all([
    api.rpc.chain.getBlockHash(0),
    api.rpc.state.getRuntimeVersion(blockHash),
    api.rpc.state.getStorageHash("0x3a636f6465", blockHash),
  ]);
  return {
    genesisHash: genesis.toHex().toLowerCase(),
    runtimeCodeHash: codeHash.toHex().toLowerCase(),
    specName: runtime.specName.toString(),
    specVersion: runtime.specVersion.toString(),
    transactionVersion: runtime.transactionVersion.toString(),
  };
}

function assertSupportedRuntime(identity) {
  if (identity.genesisHash !== PORTALDOT_GENESIS_HASH) {
    throw new NativeWalletError("WRONG_NATIVE_NETWORK", "SubWallet is not connected to the reviewed PortaldotV3 Test genesis.");
  }
  if (identity.runtimeCodeHash !== PORTALDOT_RUNTIME_CODE_HASH
    || identity.specName !== PORTALDOT_RUNTIME.specName
    || identity.specVersion !== PORTALDOT_RUNTIME.specVersion
    || identity.transactionVersion !== PORTALDOT_RUNTIME.transactionVersion) {
    throw new NativeWalletError("UNSUPPORTED_RUNTIME", "Portaldot has changed from FIRMA's reviewed runtime. Native anchoring is disabled until the new runtime is reviewed.");
  }
}

export async function inspectNativeAnchor(session, preparation, selectedAddress, {
  endpoint = PORTALDOT_NATIVE_ENDPOINT,
  apiFactory = null,
  providerFactory = (url) => new WsProvider(url, false),
  apiCreate = (options) => ApiPromise.create(options),
  connectionAttempts = NATIVE_CONNECTION_ATTEMPTS,
  connectionTimeoutMs = NATIVE_CONNECTION_TIMEOUT_MS,
  rpcTimeoutMs = NATIVE_RPC_TIMEOUT_MS,
  retryDelayMs = 250,
} = {}) {
  if (!session?.injector?.signer?.signPayload) throw new NativeWalletError("SUBWALLET_DISCONNECTED", "Reconnect SubWallet before estimating the native transaction.");
  const signer = normalizeAddress(selectedAddress);
  if (!sameAccount(signer, preparation?.signer)) throw new NativeWalletError("ACCOUNT_MISMATCH", "The selected SubWallet account does not match the account used for this preparation.");
  const selected = session.accounts.find((account) => sameAccount(account.address, signer));
  if (!selected) throw new NativeWalletError("ACCOUNT_MISMATCH", "The selected account is no longer available from SubWallet.");
  if (selected.genesisHash && selected.genesisHash !== PORTALDOT_GENESIS_HASH) {
    throw new NativeWalletError("WRONG_NATIVE_NETWORK", "The selected SubWallet account is restricted to a different genesis hash.");
  }

  let provider = null;
  let api;
  try {
    if (apiFactory) api = await apiFactory();
    else ({ api, provider } = await connectNativeApi({
      endpoint,
      signer: session.injector.signer,
      providerFactory,
      apiCreate,
      attempts: connectionAttempts,
      timeoutMs: connectionTimeoutMs,
      retryDelayMs,
    }));
    const finalizedHash = await withNativeTimeout(api.rpc.chain.getFinalizedHead(), rpcTimeoutMs, "Portaldot finalized-head request");
    const finalizedHeader = await withNativeTimeout(api.rpc.chain.getHeader(finalizedHash), rpcTimeoutMs, "Portaldot finalized-header request");
    const identity = await withNativeTimeout(runtimeIdentity(api, finalizedHash), rpcTimeoutMs, "Portaldot runtime identity check");
    assertSupportedRuntime(identity);
    if (!api.tx.system?.remarkWithEvent) throw new NativeWalletError("UNSUPPORTED_RUNTIME", "This runtime does not expose system.remarkWithEvent. Native anchoring is disabled.");
    const extrinsic = api.tx.system.remarkWithEvent(preparation.payload);
    const [payment, account] = await withNativeTimeout(Promise.all([
      extrinsic.paymentInfo(signer, { at: finalizedHash }),
      api.query.system.account.at(finalizedHash, signer),
    ]), rpcTimeoutMs, "Portaldot account-specific fee estimate");
    const free = BigInt(account.data.free.toString());
    const frozen = BigInt(account.data.frozen?.toString?.() ?? "0");
    const usable = free > frozen ? free - frozen : 0n;
    const maximumFee = BigInt(payment.partialFee.toString());
    if (usable < maximumFee) {
      throw new NativeWalletError("INSUFFICIENT_BALANCE", "The selected native account does not have enough usable tPOT for the estimated maximum fee.");
    }
    return {
      api,
      ownsApi: !apiFactory,
      provider,
      injector: session.injector,
      preparation,
      signer,
      extrinsic,
      identity,
      finalized: { number: finalizedHeader.number.toString(), hash: finalizedHash.toHex() },
      balanceBaseUnits: free.toString(),
      usableBalanceBaseUnits: usable.toString(),
      maximumFeeBaseUnits: maximumFee.toString(),
      weight: payment.weight?.toString?.() ?? null,
      callIndex: u8aToHex(extrinsic.method.callIndex),
    };
  } catch (error) {
    if (api && !apiFactory) await api.disconnect().catch(() => {});
    else if (provider) await provider.disconnect().catch(() => {});
    throw asError(error, "FIRMA could not inspect the native anchoring transaction.");
  }
}

export async function closeNativeInspection(inspection) {
  if (inspection?.ownsApi && inspection.api) await inspection.api.disconnect().catch(() => {});
}

function executionFailure(result) {
  if (result.dispatchError) return result.dispatchError.toString();
  const failed = result.events?.find(({ event }) => event.section === "system" && event.method === "ExtrinsicFailed");
  return failed ? failed.event.toString() : null;
}

export async function submitNativeAnchor(inspection, { timeoutMs = 120_000 } = {}) {
  if (!inspection?.api || !inspection?.extrinsic || !inspection?.injector?.signer) {
    throw new NativeWalletError("INVALID_PREPARATION", "Reconnect SubWallet and review a fresh native estimate before signing.");
  }
  if (submittedInspections.has(inspection)) {
    throw new NativeWalletError("DUPLICATE_SUBMISSION", "This prepared transaction has already been submitted. FIRMA will not submit it twice.");
  }
  submittedInspections.add(inspection);
  try {
    const currentFinalized = await inspection.api.rpc.chain.getFinalizedHead();
    assertSupportedRuntime(await runtimeIdentity(inspection.api, currentFinalized));
    const accounts = await inspection.injector.accounts.get();
    if (!accounts.some((account) => sameAccount(account.address, inspection.signer))) {
      throw new NativeWalletError("WALLET_CONTEXT_CHANGED", "The reviewed SubWallet account is no longer available. Reconnect and review a fresh estimate.");
    }
    let unsubscribe = null;
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new NativeWalletError("TRANSACTION_TIMEOUT", "The native transaction was not finalized before the tracking timeout. FIRMA did not retry it.")), timeoutMs);
      inspection.extrinsic.signAndSend(inspection.signer, { signer: inspection.injector.signer }, (update) => {
        const failure = executionFailure(update);
        if (failure) {
          clearTimeout(timer);
          reject(new NativeWalletError("TRANSACTION_FAILED", `The native transaction was included but failed: ${failure}`));
          return;
        }
        if (update.status.isFinalized) {
          clearTimeout(timer);
          resolve(update);
        }
      }).then((value) => { unsubscribe = value; }).catch((error) => {
        clearTimeout(timer);
        reject(asError(error, "SubWallet could not sign or submit the native transaction."));
      });
    }).finally(() => { if (typeof unsubscribe === "function") unsubscribe(); });

    const blockHash = result.status.asFinalized.toHex().toLowerCase();
    const [header, block] = await Promise.all([
      inspection.api.rpc.chain.getHeader(blockHash),
      inspection.api.rpc.chain.getBlock(blockHash),
    ]);
    const transactionHash = result.txHash.toHex().toLowerCase();
    const extrinsicIndex = result.txIndex ?? block.block.extrinsics.findIndex((entry) => entry.hash.toHex().toLowerCase() === transactionHash);
    if (!Number.isInteger(extrinsicIndex) || extrinsicIndex < 0) throw new NativeWalletError("MISSING_INCLUSION", "The finalized block did not expose the submitted extrinsic index.");
    return {
      schema: NATIVE_ANCHOR_SCHEMA,
      protocol: NATIVE_ANCHOR_PROTOCOL,
      createdAt: new Date().toISOString(),
      chain: "PortaldotV3 Test",
      genesisHash: PORTALDOT_GENESIS_HASH,
      runtime: inspection.identity,
      signer: inspection.signer,
      method: "system.remarkWithEvent",
      callIndex: inspection.callIndex,
      commitment: inspection.preparation.commitment,
      algorithm: inspection.preparation.algorithm,
      domain: inspection.preparation.domain,
      payload: inspection.preparation.payload,
      value: "0",
      estimatedFeeBaseUnits: inspection.maximumFeeBaseUnits,
      transactionHash,
      blockNumber: header.number.toString(),
      blockHash,
      extrinsicIndex: String(extrinsicIndex),
      finalized: true,
      limitations: [
        "This sidecar records a finalized commitment transaction; it does not prove every report claim is true.",
        "The signing account does not establish report authorship or real-world identity.",
      ],
    };
  } catch (error) {
    throw asError(error, "The native transaction could not be signed, submitted, or finalized.");
  } finally {
    await closeNativeInspection(inspection);
  }
}
