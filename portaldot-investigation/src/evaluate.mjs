import { PORTALDOT_V3_SUPPORT_PROFILE, STATUS } from "./constants.mjs";

const check = (id, title, status, summary, evidence = {}) => ({ id, title, status, summary, evidence });
const unavailable = (id, title, summary, evidence = {}) => check(id, title, STATUS.UNKNOWN, summary, evidence);

function callValue(call) {
  return call?.ok ? call.value : undefined;
}

function metadataOutcome(nativeMetadata, evmCalls) {
  const fields = ["name", "symbol", "decimals"];
  if (!nativeMetadata?.exists) {
    const allMissing = fields.every((field) => evmCalls?.[field]?.kind === "metadata-missing");
    if (allMissing) return [STATUS.PASS, "Both surfaces report that asset metadata is absent."];
    const anyValue = fields.some((field) => evmCalls?.[field]?.ok);
    if (anyValue) return [STATUS.FAIL, "EVM metadata exists while native metadata storage is absent."];
    return [STATUS.UNKNOWN, "Native metadata is absent, but the EVM response was not a recognized metadata-missing result."];
  }
  const unavailableField = fields.find((field) => !evmCalls?.[field]?.ok);
  if (unavailableField) {
    if (evmCalls?.[unavailableField]?.kind === "metadata-missing") {
      return [STATUS.FAIL, `Native ${unavailableField} metadata exists but the EVM precompile reports it missing.`];
    }
    return [STATUS.UNKNOWN, `EVM ${unavailableField} metadata could not be decoded.`];
  }
  const mismatches = fields.filter((field) => String(nativeMetadata[field]) !== String(evmCalls[field].value));
  return mismatches.length
    ? [STATUS.FAIL, `Metadata differs for: ${mismatches.join(", ")}.`]
    : [STATUS.PASS, "Name, symbol, and decimals match exactly across both surfaces."];
}

function runtimeProfileMismatches(substrate, evm) {
  const runtime = substrate?.runtime;
  const fingerprint = runtime?.fingerprint;
  const profile = PORTALDOT_V3_SUPPORT_PROFILE;
  const mismatches = [];
  const exactFields = ["specName", "specVersion", "transactionVersion", "metadataVersion"];
  for (const field of exactFields) {
    if (runtime?.[field] !== profile[field]) mismatches.push(field);
  }
  if (fingerprint?.genesisHash !== profile.genesisHash) mismatches.push("genesisHash");
  if (fingerprint?.runtimeCodeHash !== profile.runtimeCodeHash) mismatches.push("runtimeCodeHash");
  if (fingerprint?.runtimeCodeHashAlgorithm !== profile.runtimeCodeHashAlgorithm) mismatches.push("runtimeCodeHashAlgorithm");
  if (fingerprint?.collectedAtBlockHash !== substrate?.finalized?.hash) mismatches.push("runtimeCodeBlockContext");
  if (evm?.identity?.chainId !== profile.evmChainId) mismatches.push("evmChainId");
  const pallets = runtime?.pallets ?? [];
  for (const pallet of profile.requiredPallets) {
    if (!pallets.includes(pallet)) mismatches.push(`pallet:${pallet}`);
  }
  for (const surface of profile.requiredQuerySurfaces) {
    if (runtime?.querySurfaces?.[surface] !== true) mismatches.push(`querySurface:${surface}`);
  }
  return mismatches;
}

export function evaluateSnapshot(snapshot) {
  const checks = [];
  const substrate = snapshot.substrate;
  const evm = snapshot.evm;

  checks.push(substrate?.reachable
    ? check("network.substrate", "Substrate endpoint", STATUS.PASS, "The Substrate endpoint returned a finalized block.", substrate.identity)
    : unavailable("network.substrate", "Substrate endpoint", "The Substrate endpoint did not provide usable evidence.", substrate?.error));
  checks.push(evm?.reachable
    ? check("network.evm", "EVM endpoint", STATUS.PASS, "The EVM endpoint answered standard read-only JSON-RPC methods.", evm.identity)
    : unavailable("network.evm", "EVM endpoint", "The EVM endpoint did not provide usable evidence.", evm?.error));

  if (evm?.identity?.chainId) {
    const matches = evm.identity.chainId === snapshot.input.expectedChainId;
    checks.push(check("identity.chainId", "Expected EVM chain ID", matches ? STATUS.PASS : STATUS.FAIL,
      matches ? `Chain ID is ${evm.identity.chainId}.` : `Expected ${snapshot.input.expectedChainId}, received ${evm.identity.chainId}.`,
      { expected: snapshot.input.expectedChainId, actual: evm.identity.chainId }));
  } else checks.push(unavailable("identity.chainId", "Expected EVM chain ID", "No chain ID response was available."));

  let runtimeSupported = false;
  if (substrate?.runtime) {
    const mismatches = runtimeProfileMismatches(substrate, evm);
    runtimeSupported = mismatches.length === 0;
    checks.push(check("runtime.support", "Runtime support", runtimeSupported ? STATUS.PASS : STATUS.UNKNOWN,
      runtimeSupported ? `Runtime ${substrate.runtime.specName}/${substrate.runtime.specVersion} matches FIRMA's verified support profile.` : "This runtime is not in FIRMA's verified support envelope.",
      { ...substrate.runtime, supportProfile: PORTALDOT_V3_SUPPORT_PROFILE.id, mismatchReasons: mismatches }));
  } else checks.push(unavailable("runtime.support", "Runtime support", "Runtime metadata was unavailable."));

  const sameBlock = Boolean(substrate?.finalized?.number && evm?.block?.number && substrate.finalized.number === evm.block.number);
  checks.push(check("context.block", "Shared block context", sameBlock ? STATUS.PASS : STATUS.UNKNOWN,
    sameBlock ? `Both reads are pinned to finalized block ${substrate.finalized.number}.` : "The EVM endpoint could not serve the finalized Substrate block; parity was not evaluated across different blocks.",
    { substrate: substrate?.finalized ?? null, evm: evm?.block ?? null }));

  if (!runtimeSupported) {
    checks.push(unavailable("asset.supply", "Total supply parity", "Parity is suppressed because this runtime is outside FIRMA's verified support envelope."));
    checks.push(unavailable("account.mapping", "Runtime account mapping", "Mapping interpretation is suppressed for an unsupported runtime."));
    checks.push(unavailable("asset.balance", "Account balance parity", "Balance parity is suppressed for an unsupported runtime."));
    checks.push(unavailable("asset.metadata", "Metadata parity", "Metadata parity is suppressed for an unsupported runtime."));
  } else if (!substrate?.asset?.exists) {
    checks.push(unavailable("asset.supply", "Total supply parity", "The native asset does not exist or could not be read."));
    checks.push(unavailable("account.mapping", "Runtime account mapping", "Account mapping could not be evaluated without native asset evidence."));
    checks.push(unavailable("asset.balance", "Account balance parity", "Balance parity could not be evaluated."));
    checks.push(unavailable("asset.metadata", "Metadata parity", "Metadata parity could not be evaluated."));
  } else {
    const supply = evm?.calls?.totalSupply;
    if (!sameBlock || !supply?.ok) checks.push(unavailable("asset.supply", "Total supply parity", "A same-block EVM totalSupply result was unavailable.", supply?.error));
    else {
      const matches = substrate.asset.supply === callValue(supply);
      checks.push(check("asset.supply", "Total supply parity", matches ? STATUS.PASS : STATUS.FAIL,
        matches ? "Native supply and EVM totalSupply match exactly." : "Native supply and EVM totalSupply differ.",
        { native: substrate.asset.supply, evm: callValue(supply), unit: "base units" }));
    }

    const mapping = substrate.accountMapping;
    checks.push(mapping?.exists
      ? check("account.mapping", "Runtime account mapping", STATUS.PASS, "Revive storage maps the EVM address to a native AccountId.", mapping)
      : unavailable("account.mapping", "Runtime account mapping", "No runtime-backed EVM-to-native account mapping was found.", mapping ?? {}));

    const balance = evm?.calls?.balanceOf;
    if (!sameBlock || !mapping?.exists || !substrate.balance?.exists || !balance?.ok) {
      checks.push(unavailable("asset.balance", "Account balance parity", "A mapped, same-block balance pair was unavailable.", balance?.error));
    } else {
      const matches = substrate.balance.value === callValue(balance);
      checks.push(check("asset.balance", "Account balance parity", matches ? STATUS.PASS : STATUS.FAIL,
        matches ? "Native and EVM account balances match exactly." : "Native and EVM account balances differ.",
        { native: substrate.balance.value, evm: callValue(balance), unit: "base units" }));
    }

    if (!sameBlock) checks.push(unavailable("asset.metadata", "Metadata parity", "Metadata was not compared across different block contexts."));
    else {
      const [status, summary] = metadataOutcome(substrate.asset.metadata, evm?.calls);
      checks.push(check("asset.metadata", "Metadata parity", status, summary, { native: substrate.asset.metadata, evm: evm?.calls }));
    }
  }

  const overall = checks.some((item) => item.status === STATUS.FAIL)
    ? STATUS.FAIL
    : checks.some((item) => item.status === STATUS.UNKNOWN) ? STATUS.UNKNOWN : STATUS.PASS;
  return { overall, counts: Object.fromEntries(Object.values(STATUS).map((status) => [status, checks.filter((item) => item.status === status).length])), checks };
}

