import { isDeepStrictEqual } from "node:util";
import { computeReportCommitment } from "../experimental/onchain-proof/src/report-commitment.mjs";
import { DEFAULTS } from "./constants.mjs";
import { evaluateSnapshot } from "./evaluate.mjs";
import { parseExpectedCommitment, parseImportedReport } from "./report-import.mjs";
import { collectSnapshot } from "./verifier.mjs";

export const INDEPENDENT_SCHEMA = "firma.independent-verification.v1";
export const INDEPENDENT_STATUS = Object.freeze({ VERIFIED: "VERIFIED", MISMATCH: "MISMATCH", UNAVAILABLE: "UNAVAILABLE" });

function semanticCall(call) {
  if (!call || typeof call.ok !== "boolean") return undefined;
  return call.ok ? { ok: true, value: call.value, raw: call.raw } : { ok: false, kind: call.kind ?? "rpc-error" };
}

function hasHistoricalSubstrate(snapshot) {
  const substrate = snapshot.substrate;
  if (substrate?.reachable !== true || substrate?.historical?.available === false || substrate?.historical?.finalized === false) return false;
  if (!substrate?.finalized?.number || !substrate?.latestFinalized?.number) return false;
  try {
    return BigInt(substrate.finalized.number) <= BigInt(substrate.latestFinalized.number);
  } catch {
    return false;
  }
}

function hasHistoricalEvm(snapshot) {
  return snapshot.evm?.reachable === true && snapshot.evm?.block?.available === true;
}

function claimSpecs(report, snapshot) {
  const importedSubstrate = report.evidence.substrate;
  const importedEvm = report.evidence.evm;
  const reproducedSubstrate = snapshot.substrate;
  const reproducedEvm = snapshot.evm;
  const substrateAvailable = hasHistoricalSubstrate(snapshot);
  const evmAvailable = hasHistoricalEvm(snapshot);
  const runtimeAvailable = substrateAvailable && Boolean(reproducedSubstrate.runtime);
  const nativeAssetAvailable = substrateAvailable && Boolean(reproducedSubstrate.asset);
  const mappingAvailable = substrateAvailable && Boolean(reproducedSubstrate.accountMapping);
  const balanceAvailable = substrateAvailable && Boolean(reproducedSubstrate.balance);
  const callAvailable = (name, allowMissing = false) => evmAvailable && (
    reproducedEvm.calls?.[name]?.ok === true
    || (allowMissing && reproducedEvm.calls?.[name]?.kind === "metadata-missing")
  );

  return [
    {
      id: "network.substrate", title: "Native network identity",
      available: substrateAvailable && Boolean(reproducedSubstrate.identity),
      reason: reproducedSubstrate?.error?.message ?? "The exact native block could not be retrieved.",
      imported: { chain: importedSubstrate.identity.chain, properties: importedSubstrate.identity.properties },
      reproduced: { chain: reproducedSubstrate?.identity?.chain, properties: reproducedSubstrate?.identity?.properties },
    },
    {
      id: "network.evm", title: "EVM network identity",
      available: Boolean(reproducedEvm?.identity?.chainId),
      reason: reproducedEvm?.error?.message ?? "The EVM chain identity could not be retrieved.",
      imported: { chainId: importedEvm.identity.chainId }, reproduced: { chainId: reproducedEvm?.identity?.chainId },
    },
    {
      id: "block.substrate", title: "Native finalized block reference", available: substrateAvailable,
      reason: reproducedSubstrate?.error?.message ?? "The exact native block could not be retrieved.",
      imported: importedSubstrate.finalized, reproduced: reproducedSubstrate?.finalized,
    },
    {
      id: "block.evm", title: "EVM historical block reference", available: evmAvailable,
      reason: reproducedEvm?.error?.message ?? `EVM block ${importedEvm.block.number} was not returned.`,
      imported: { number: importedEvm.block.number, hash: importedEvm.block.hash, available: importedEvm.block.available },
      reproduced: reproducedEvm?.block ? { number: reproducedEvm.block.number, hash: reproducedEvm.block.hash, available: reproducedEvm.block.available } : undefined,
    },
    {
      id: "runtime.version", title: "Runtime version and metadata", available: runtimeAvailable,
      reason: reproducedSubstrate?.error?.message ?? "Historical runtime metadata could not be retrieved.",
      imported: {
        specName: importedSubstrate.runtime.specName, specVersion: importedSubstrate.runtime.specVersion,
        transactionVersion: importedSubstrate.runtime.transactionVersion, metadataVersion: importedSubstrate.runtime.metadataVersion,
        metadataSha256: importedSubstrate.runtime.metadataSha256, pallets: importedSubstrate.runtime.pallets,
        querySurfaces: importedSubstrate.runtime.querySurfaces,
      },
      reproduced: reproducedSubstrate?.runtime ? {
        specName: reproducedSubstrate.runtime.specName, specVersion: reproducedSubstrate.runtime.specVersion,
        transactionVersion: reproducedSubstrate.runtime.transactionVersion, metadataVersion: reproducedSubstrate.runtime.metadataVersion,
        metadataSha256: reproducedSubstrate.runtime.metadataSha256, pallets: reproducedSubstrate.runtime.pallets,
        querySurfaces: reproducedSubstrate.runtime.querySurfaces,
      } : undefined,
    },
    {
      id: "runtime.fingerprint", title: "Genesis and runtime-code fingerprint",
      available: runtimeAvailable && Boolean(reproducedSubstrate.runtime?.fingerprint?.genesisHash) && Boolean(reproducedSubstrate.runtime?.fingerprint?.runtimeCodeHash),
      reason: reproducedSubstrate?.runtime?.fingerprint?.errors?.runtimeCodeHash?.message
        ?? reproducedSubstrate?.runtime?.fingerprint?.errors?.genesisHash?.message
        ?? "The historical runtime fingerprint could not be retrieved.",
      imported: importedSubstrate.runtime.fingerprint, reproduced: reproducedSubstrate?.runtime?.fingerprint,
    },
    {
      id: "asset.identifier", title: "Asset identifiers",
      available: nativeAssetAvailable && evmAvailable && Boolean(reproducedEvm.precompileAddress),
      reason: "The exact-block native asset or EVM precompile identifier could not be checked.",
      imported: { assetId: String(importedSubstrate.asset.id), precompileAddress: importedEvm.precompileAddress },
      reproduced: reproducedSubstrate?.asset ? { assetId: String(reproducedSubstrate.asset.id), precompileAddress: reproducedEvm?.precompileAddress } : undefined,
    },
    {
      id: "asset.native", title: "Native asset existence and supply", available: nativeAssetAvailable,
      reason: reproducedSubstrate?.error?.message ?? "Historical native asset state could not be retrieved.",
      imported: { exists: importedSubstrate.asset.exists, id: importedSubstrate.asset.id, supply: importedSubstrate.asset.supply, storageKey: importedSubstrate.asset.storageKey },
      reproduced: reproducedSubstrate?.asset ? { exists: reproducedSubstrate.asset.exists, id: reproducedSubstrate.asset.id, supply: reproducedSubstrate.asset.supply, storageKey: reproducedSubstrate.asset.storageKey } : undefined,
    },
    {
      id: "account.mapping", title: "Runtime account mapping", available: mappingAvailable,
      reason: reproducedSubstrate?.error?.message ?? "Historical account-mapping state could not be retrieved.",
      imported: { exists: importedSubstrate.accountMapping.exists, h160: importedSubstrate.accountMapping.h160, accountId: importedSubstrate.accountMapping.accountId, storageKey: importedSubstrate.accountMapping.storageKey },
      reproduced: reproducedSubstrate?.accountMapping ? { exists: reproducedSubstrate.accountMapping.exists, h160: reproducedSubstrate.accountMapping.h160, accountId: reproducedSubstrate.accountMapping.accountId, storageKey: reproducedSubstrate.accountMapping.storageKey } : undefined,
    },
    {
      id: "asset.balance.native", title: "Native account balance", available: balanceAvailable,
      reason: reproducedSubstrate?.error?.message ?? "Historical native balance state could not be retrieved.",
      imported: { exists: importedSubstrate.balance.exists, value: importedSubstrate.balance.value, storageKey: importedSubstrate.balance.storageKey },
      reproduced: reproducedSubstrate?.balance ? { exists: reproducedSubstrate.balance.exists, value: reproducedSubstrate.balance.value, storageKey: reproducedSubstrate.balance.storageKey } : undefined,
    },
    {
      id: "asset.metadata.native", title: "Native asset metadata",
      available: nativeAssetAvailable && Boolean(reproducedSubstrate.asset?.metadata),
      reason: reproducedSubstrate?.error?.message ?? "Historical native metadata could not be retrieved.",
      imported: importedSubstrate.asset.metadata, reproduced: reproducedSubstrate?.asset?.metadata,
    },
    ...["totalSupply", "balanceOf"].map((name) => ({
      id: `evm.${name}`, title: `EVM ${name}`, available: callAvailable(name),
      reason: reproducedEvm?.calls?.[name]?.error?.message ?? `Historical EVM ${name} could not be retrieved.`,
      imported: semanticCall(importedEvm.calls[name]), reproduced: semanticCall(reproducedEvm?.calls?.[name]),
    })),
    ...["name", "symbol", "decimals"].map((name) => ({
      id: `evm.${name}`, title: `EVM ${name}`, available: callAvailable(name, true),
      reason: reproducedEvm?.calls?.[name]?.error?.message ?? `Historical EVM ${name} could not be retrieved.`,
      imported: semanticCall(importedEvm.calls[name]), reproduced: semanticCall(reproducedEvm?.calls?.[name]),
    })),
  ];
}

function claimComparison(spec) {
  if (!spec.available) {
    return {
      id: `claim.${spec.id}`, title: spec.title, status: INDEPENDENT_STATUS.UNAVAILABLE,
      summary: "The exact historical evidence could not be retrieved or safely checked.",
      evidence: { imported: spec.imported ?? null, reproduced: null, reason: spec.reason },
    };
  }
  const matches = isDeepStrictEqual(spec.imported, spec.reproduced);
  return {
    id: `claim.${spec.id}`, title: spec.title,
    status: matches ? INDEPENDENT_STATUS.VERIFIED : INDEPENDENT_STATUS.MISMATCH,
    summary: matches ? "The exact historical RPC result reproduced this claim." : "The exact historical RPC result disagrees with this imported claim.",
    evidence: { imported: spec.imported ?? null, reproduced: spec.reproduced ?? null },
  };
}

function verdictAvailability(checkId, snapshot) {
  const substrate = hasHistoricalSubstrate(snapshot);
  const evm = hasHistoricalEvm(snapshot);
  const calls = snapshot.evm?.calls;
  switch (checkId) {
    case "network.substrate": return substrate;
    case "network.evm":
    case "identity.chainId": return Boolean(snapshot.evm?.identity?.chainId);
    case "runtime.support": return substrate && Boolean(snapshot.substrate?.runtime) && Boolean(snapshot.evm?.identity?.chainId);
    case "context.block": return substrate && evm;
    case "asset.supply": return substrate && evm && Boolean(snapshot.substrate?.asset) && calls?.totalSupply?.ok === true;
    case "account.mapping": return substrate && Boolean(snapshot.substrate?.accountMapping);
    case "asset.balance": return substrate && evm && Boolean(snapshot.substrate?.balance) && calls?.balanceOf?.ok === true;
    case "asset.metadata": return substrate && evm && Boolean(snapshot.substrate?.asset?.metadata)
      && ["name", "symbol", "decimals"].every((name) => calls?.[name]?.ok === true || calls?.[name]?.kind === "metadata-missing");
    default: return false;
  }
}

function verdictComparisons(report, reproducedVerdict, snapshot) {
  const reproducedById = new Map(reproducedVerdict.checks.map((check) => [check.id, check.status]));
  return report.verdict.checks.map((imported) => {
    if (!verdictAvailability(imported.id, snapshot)) {
      return {
        id: `verdict.${imported.id}`, title: `${imported.title} verdict`, status: INDEPENDENT_STATUS.UNAVAILABLE,
        summary: "This original verdict could not be recomputed from exact historical evidence.",
        evidence: { imported: imported.status, reproduced: null },
      };
    }
    const reproduced = reproducedById.get(imported.id);
    const matches = imported.status === reproduced;
    return {
      id: `verdict.${imported.id}`, title: `${imported.title} verdict`,
      status: matches ? INDEPENDENT_STATUS.VERIFIED : INDEPENDENT_STATUS.MISMATCH,
      summary: matches ? "FIRMA independently recomputed the original verdict." : "The independently recomputed verdict disagrees with the original report.",
      evidence: { imported: imported.status, reproduced },
    };
  });
}

export async function independentlyVerifyReport({ report, expectedCommitment = null, network = {}, collectSnapshotFn = collectSnapshot }) {
  parseImportedReport(report);
  const normalizedCommitment = parseExpectedCommitment(expectedCommitment);
  const originalBefore = JSON.stringify(report);
  const targetBlock = report.evidence.substrate.finalized.number;
  const input = { ...DEFAULTS, ...network, expectedChainId: report.input.expectedChainId, assetId: report.input.assetId, account: report.input.account };
  const startedAt = new Date().toISOString();
  const collected = await collectSnapshotFn(input, targetBlock);
  // RPC libraries may expose codec wrapper objects. The imported artifact and
  // HTTP response are JSON, so compare against the same plain-JSON boundary.
  const snapshot = JSON.parse(JSON.stringify(collected.snapshot));
  const reproducedVerdict = evaluateSnapshot(snapshot);
  const checks = claimSpecs(report, snapshot).map(claimComparison);
  checks.push(...verdictComparisons(report, reproducedVerdict, snapshot));

  const computed = computeReportCommitment(report);
  const commitmentMatches = normalizedCommitment === null || normalizedCommitment === computed.commitment;
  const commitmentCheck = {
    id: "report.commitment", title: "Deterministic report commitment",
    status: commitmentMatches ? INDEPENDENT_STATUS.VERIFIED : INDEPENDENT_STATUS.MISMATCH,
    summary: normalizedCommitment === null
      ? "FIRMA independently recomputed the deterministic commitment for the preserved report."
      : commitmentMatches ? "The supplied commitment matches the preserved imported report." : "The supplied commitment does not match the preserved imported report.",
    evidence: { algorithm: computed.algorithm, domain: computed.domain, expected: normalizedCommitment, computed: computed.commitment },
  };
  checks.push(commitmentCheck);

  const hasMismatch = checks.some((check) => check.status === INDEPENDENT_STATUS.MISMATCH);
  const hasUnavailable = checks.some((check) => check.status === INDEPENDENT_STATUS.UNAVAILABLE);
  const overall = hasMismatch ? INDEPENDENT_STATUS.MISMATCH : hasUnavailable ? INDEPENDENT_STATUS.UNAVAILABLE : INDEPENDENT_STATUS.VERIFIED;
  if (JSON.stringify(report) !== originalBefore) throw new Error("Imported report changed during independent verification.");
  const unavailable = checks.filter((check) => check.status === INDEPENDENT_STATUS.UNAVAILABLE)
    .map((check) => ({ check: check.id, reason: check.evidence.reason ?? check.summary }));

  return {
    schema: INDEPENDENT_SCHEMA, startedAt, completedAt: new Date().toISOString(),
    importedReport: report, importedVerdict: report.verdict, commitment: commitmentCheck.evidence,
    independent: {
      overall,
      summary: overall === INDEPENDENT_STATUS.VERIFIED
        ? "The report's supported claims were independently reproduced at its exact finalized block."
        : overall === INDEPENDENT_STATUS.MISMATCH
          ? "At least one imported claim disagrees with independently reproduced evidence."
          : "The exact historical evidence could not be retrieved or checked safely.",
      requestedBlock: { number: targetBlock, substrateHash: report.evidence.substrate.finalized.hash, evmHash: report.evidence.evm.block.hash },
      unavailable,
      counts: Object.fromEntries(Object.values(INDEPENDENT_STATUS).map((status) => [status, checks.filter((check) => check.status === status).length])),
      checks, reproducedVerdict, reproducedEvidence: snapshot,
    },
    limitations: [
      "Independent verification uses the configured Portaldot V3 endpoints and never trusts endpoint URLs embedded in the imported report.",
      "Current state is never substituted when the exact historical block is unavailable.",
      "A verified commitment proves the deterministic hash of the imported JSON report; it does not prove that the commitment was recorded on-chain.",
      "No wallet, signing, transaction submission, or contract functionality is enabled.",
    ],
  };
}
