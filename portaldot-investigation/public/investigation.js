const VALID_STATUS = new Set(["PASS", "FAIL", "UNKNOWN"]);
const REQUIRED_CHECK_IDS = Object.freeze([
  "network.substrate",
  "network.evm",
  "identity.chainId",
  "runtime.support",
  "context.block",
  "asset.supply",
  "account.mapping",
  "asset.balance",
  "asset.metadata",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" && value.length ? value : null;
}

function errorText(error) {
  if (!error || typeof error !== "object") return null;
  const name = text(error.name);
  const message = text(error.message);
  return [name, message].filter(Boolean).join(": ") || null;
}

function reference(path, label, value) {
  const normalized = typeof value === "number" || typeof value === "boolean" ? String(value) : text(value);
  return normalized ? { path, label, value: normalized } : null;
}

function references(...items) {
  return items.filter(Boolean);
}

function result(observed, proves, doesNotProve, nextSteps, evidenceReferences, integrity = "SUPPORTED") {
  return Object.freeze({
    observed,
    proves,
    doesNotProve,
    nextSteps: Object.freeze(nextSteps),
    evidenceReferences: Object.freeze(evidenceReferences),
    integrity,
  });
}

function unavailableObservation(label, error) {
  const detail = errorText(error);
  return detail
    ? `${label} was unavailable. The recorded error was ${detail}.`
    : `${label} was unavailable or malformed in this report.`;
}

function integerText(value) {
  return typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) ? value : null;
}

function sharedBlockEvidence(report) {
  const substrate = report?.evidence?.substrate;
  const finalized = substrate?.finalized;
  const historical = substrate?.historical;
  const latestFinalized = substrate?.latestFinalized;
  const block = report?.evidence?.evm?.block;
  const native = integerText(finalized?.number);
  const evm = integerText(block?.number);
  const issues = [];

  if (!isRecord(finalized) || !native || !text(finalized?.hash)) {
    issues.push("the native finalized-block observation is missing or malformed");
  }
  if (!isRecord(block) || !evm || !text(block?.hash)) {
    issues.push("the EVM block observation is missing or malformed");
  }
  if (block?.available !== true) issues.push("the EVM block is not affirmatively recorded as available");
  if (native && evm && native !== evm) issues.push(`native block ${native} and EVM block ${evm} differ`);

  if (historical !== undefined) {
    const requested = integerText(historical?.requestedNumber);
    if (!isRecord(historical) || historical.available !== true || historical.finalized !== true || !requested) {
      issues.push("the native historical-block finality evidence is missing, unavailable, or malformed");
    } else if (native && requested !== native) {
      issues.push(`the native historical request ${requested} does not match finalized block ${native}`);
    }
  }

  if (latestFinalized !== undefined) {
    const latest = integerText(latestFinalized?.number);
    if (!isRecord(latestFinalized) || !latest || !text(latestFinalized?.hash)) {
      issues.push("the latest finalized-head context is malformed");
    } else if (native && BigInt(latest) < BigInt(native)) {
      issues.push(`finalized block ${native} is newer than the recorded finalized head ${latest}`);
    } else if (native === latest && text(finalized?.hash) !== text(latestFinalized.hash)) {
      issues.push("the selected native block hash conflicts with the finalized-head hash");
    }
  }

  if (block?.requestedTag !== undefined) {
    const tag = typeof block.requestedTag === "string" && /^0x[0-9a-fA-F]+$/.test(block.requestedTag)
      ? BigInt(block.requestedTag).toString()
      : null;
    if (!tag || (evm && tag !== evm)) issues.push("the requested EVM block tag does not match the observed EVM block");
  }

  return Object.freeze({
    number: issues.length === 0 ? native : null,
    issues: Object.freeze(issues),
  });
}

function h160Text(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) ? value : null;
}

function accountIdText(value) {
  return typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{47,48}$/.test(value) ? value : null;
}

function mappingEvidence(report) {
  const mapping = report?.evidence?.substrate?.accountMapping;
  const requested = h160Text(report?.input?.account);
  if (!isRecord(mapping)) {
    return Object.freeze({ kind: "INCOMPLETE", h160: null, accountId: null, reason: "the observed Revive mapping is missing or malformed" });
  }
  const observed = h160Text(mapping.h160);
  const accountId = accountIdText(mapping.accountId);
  if (!requested) {
    return Object.freeze({ kind: "INCOMPLETE", h160: observed, accountId, reason: "the requested account is missing or malformed" });
  }
  if (!observed) {
    return Object.freeze({ kind: "INCOMPLETE", h160: null, accountId, reason: "the observed mapping H160 is missing or malformed" });
  }
  if (observed.toLowerCase() !== requested.toLowerCase()) {
    return Object.freeze({ kind: "INCOMPLETE", h160: observed, accountId, reason: "the observed mapping H160 does not match the requested account" });
  }
  if (mapping.exists === false) {
    if (mapping.accountId !== null && mapping.accountId !== undefined) {
      return Object.freeze({ kind: "INCOMPLETE", h160: observed, accountId, reason: "a mapping recorded as absent also contains an AccountId" });
    }
    return Object.freeze({ kind: "MISSING", h160: observed, accountId: null, reason: "the observed Revive mapping is explicitly absent" });
  }
  if (mapping.exists !== true) {
    return Object.freeze({ kind: "INCOMPLETE", h160: observed, accountId, reason: "the observed mapping presence flag is missing or malformed" });
  }
  if (!accountId) {
    return Object.freeze({ kind: "INCOMPLETE", h160: observed, accountId: null, reason: "the observed mapped AccountId is missing or malformed" });
  }
  return Object.freeze({ kind: "VALID", h160: observed, accountId, reason: null });
}

function dependentAssetGate(report) {
  const checks = Array.isArray(report?.verdict?.checks) ? report.verdict.checks : [];
  const runtime = checks.find((check) => check?.id === "runtime.support");
  if (!runtime) return null;
  if (runtime?.status !== "PASS") {
    return Object.freeze({
      reason: "the evaluator did not authorize dependent asset interpretation because runtime support was not established",
      nextStep: "Resolve the runtime-support finding before interpreting raw asset, mapping, balance, or metadata observations.",
    });
  }
  if (!report?.evidence?.substrate?.asset?.exists) {
    return Object.freeze({
      reason: "the evaluator did not authorize dependent asset checks because the native asset was absent or could not be read",
      nextStep: "Confirm the native asset record before interpreting dependent mapping or parity observations.",
    });
  }
  return null;
}

function evidenceStatusGuidance(check, evidenceStatus, evidenceDescription, refs) {
  if (VALID_STATUS.has(check?.status) && check.status === evidenceStatus) return null;
  const reportedStatus = text(check?.status) ?? "missing";
  return result(
    `The report labels this check ${reportedStatus}, but ${evidenceDescription} The reported status and supporting evidence cannot be reconciled.`,
    "The report is internally inconsistent, so this check's conclusion cannot be established from the displayed evidence.",
    "The reported status alone does not prove agreement, contradiction, or unavailability, and FIRMA has not changed the original status.",
    [
      "Independently reproduce this check from the recorded inputs and block context.",
      "Inspect the original report and evidence source before relying on this result.",
    ],
    refs,
    "INCONSISTENT",
  );
}

function networkGuidance(report, check, surface) {
  const evidence = report?.evidence?.[surface];
  const isSubstrate = surface === "substrate";
  const label = isSubstrate ? "The Substrate endpoint" : "The EVM endpoint";
  const refs = references(
    reference(`evidence.${surface}.endpoint`, "Endpoint", evidence?.endpoint),
    reference(`evidence.${surface}.identity.chain`, "Native chain", evidence?.identity?.chain),
    reference(`evidence.${surface}.identity.chainId`, "EVM chain ID", evidence?.identity?.chainId),
    reference(`evidence.${surface}.finalized.number`, "Finalized block", evidence?.finalized?.number),
    reference(`evidence.${surface}.error`, "Recorded error", errorText(evidence?.error)),
  );
  const evidenceStatus = evidence?.reachable === true ? "PASS" : "UNKNOWN";
  const inconsistent = evidenceStatusGuidance(
    check,
    evidenceStatus,
    evidenceStatus === "PASS" ? `${label} is recorded as reachable.` : `${label} does not have a usable reachability observation.`,
    refs,
  );
  if (inconsistent) return inconsistent;
  if (evidenceStatus === "PASS") {
    const context = isSubstrate && text(evidence?.finalized?.number)
      ? ` and returned finalized block ${evidence.finalized.number}`
      : "";
    return result(
      `${label} answered the read-only requests${context}.`,
      `FIRMA obtained usable ${isSubstrate ? "native-chain" : "EVM"} evidence for this verification.`,
      "Endpoint availability does not prove endpoint honesty, consensus correctness, or transaction behavior.",
      ["Continue with the identity, runtime, block-context, and asset checks before drawing a parity conclusion."],
      refs,
    );
  }
  const detail = errorText(evidence?.error);
  const timedOut = /timeout|timed out/i.test(detail ?? "");
  return result(
    unavailableObservation(label, evidence?.error),
    "FIRMA did not obtain enough endpoint evidence to support dependent conclusions.",
    "This does not demonstrate a chain defect or a contradiction between the native and EVM interfaces.",
    [
      timedOut ? "Retry after confirming the endpoint is reachable and responsive." : "Confirm the configured endpoint and retry the read-only request.",
      "If the problem persists, preserve the recorded error and inspect endpoint availability before investigating asset behavior.",
    ],
    refs,
  );
}

function chainIdentityGuidance(report, check) {
  const expected = integerText(report?.input?.expectedChainId) ?? integerText(report?.evidence?.input?.expectedChainId);
  const actual = integerText(report?.evidence?.evm?.identity?.chainId);
  const refs = references(
    reference("input.expectedChainId", "Expected chain ID", expected),
    reference("evidence.evm.identity.chainId", "Observed chain ID", actual),
    reference("evidence.evm.identity.chainIdHex", "Observed chain ID (hex)", report?.evidence?.evm?.identity?.chainIdHex),
  );
  const evidenceStatus = !expected || !actual ? "UNKNOWN" : actual === expected ? "PASS" : "FAIL";
  const inconsistent = evidenceStatusGuidance(
    check,
    evidenceStatus,
    evidenceStatus === "UNKNOWN"
      ? "the expected or observed chain ID is missing or malformed."
      : evidenceStatus === "PASS"
        ? `the observed chain ID ${actual} matches the expected chain ID.`
        : `the observed chain ID ${actual} differs from the expected chain ID ${expected}.`,
    refs,
  );
  if (inconsistent) return inconsistent;
  if (!expected || !actual) {
    return result(
      "The expected or observed EVM chain ID is missing or malformed.",
      "FIRMA cannot establish that the EVM evidence came from the configured Portaldot V3 chain.",
      "Missing identity evidence is not proof that the endpoint is on the wrong chain.",
      ["Confirm the configured expected chain ID, then repeat the EVM identity read."],
      refs,
    );
  }
  if (actual !== expected) {
    return result(
      `The EVM endpoint reported chain ID ${actual}; FIRMA expected ${expected}.`,
      "The observed EVM chain identity contradicts the configured expected chain identity.",
      "This does not identify why the endpoint or expected configuration differs, and it does not prove an asset-state mismatch.",
      ["Check the operator-controlled EVM endpoint and expected chain ID before trusting any dependent asset observations."],
      refs,
    );
  }
  return result(
    `The EVM endpoint reported the expected chain ID ${actual}.`,
    "The EVM identity observation agrees with FIRMA's configured chain expectation.",
    "Chain ID agreement alone does not prove runtime support, endpoint honesty, or asset parity.",
    ["Review the runtime fingerprint and shared-block checks next."],
    refs,
  );
}

function runtimeGuidance(report, check) {
  const runtime = report?.evidence?.substrate?.runtime;
  const fingerprint = runtime?.fingerprint;
  const mismatchReasons = Array.isArray(check?.evidence?.mismatchReasons)
    ? check.evidence.mismatchReasons.filter((item) => typeof item === "string")
    : [];
  const version = text(runtime?.specName) && text(runtime?.specVersion)
    ? `${runtime.specName}/${runtime.specVersion}`
    : null;
  const refs = references(
    reference("evidence.substrate.runtime", "Runtime", version),
    reference("evidence.substrate.runtime.fingerprint.genesisHash", "Genesis hash", fingerprint?.genesisHash),
    reference("evidence.substrate.runtime.fingerprint.runtimeCodeHash", "Runtime-code hash", fingerprint?.runtimeCodeHash),
    reference("verdict.checks[runtime.support].evidence.mismatchReasons", "Profile differences", mismatchReasons.join(", ")),
  );
  const assessmentAvailable = Boolean(version && text(fingerprint?.runtimeCodeHash) && Array.isArray(check?.evidence?.mismatchReasons));
  const evidenceStatus = assessmentAvailable && mismatchReasons.length === 0 ? "PASS" : "UNKNOWN";
  const inconsistent = evidenceStatusGuidance(
    check,
    evidenceStatus,
    evidenceStatus === "PASS"
      ? "the recorded runtime fingerprint has no reported support-profile differences."
      : mismatchReasons.length
        ? `the runtime support evidence lists differences: ${mismatchReasons.join(", ")}.`
        : "the runtime support evidence is missing or malformed.",
    refs,
  );
  if (inconsistent) return inconsistent;
  if (evidenceStatus === "PASS") {
    return result(
      `Runtime ${version} and its finalized runtime-code fingerprint matched FIRMA's reviewed support profile.`,
      "FIRMA can safely apply its reviewed storage, account-mapping, and asset-precompile interpretations at this block.",
      "Runtime recognition does not prove that writes, events, fees, permits, or every runtime behavior are correct.",
      ["Continue with the same-block asset comparisons; investigate any later mismatch independently."],
      refs,
    );
  }
  const observed = mismatchReasons.length
    ? `The runtime was outside FIRMA's reviewed support profile. Differing or missing fields: ${mismatchReasons.join(", ")}.`
    : "The runtime identity or finalized runtime-code fingerprint was missing or could not be recognized.";
  return result(
    observed,
    "FIRMA cannot safely interpret dependent native storage and EVM precompile observations under its reviewed Portaldot V3 assumptions.",
    "This does not prove the runtime is defective or incompatible; it means this FIRMA version has not established support for it.",
    [
      "Inspect the recorded genesis hash, runtime-code hash, version fields, pallets, and query surfaces.",
      "Review and test any new runtime profile before changing FIRMA's fail-closed support policy.",
    ],
    refs,
  );
}

function blockGuidance(report, check) {
  const substrate = report?.evidence?.substrate;
  const evm = report?.evidence?.evm;
  const nativeBlock = integerText(substrate?.finalized?.number);
  const evmBlock = integerText(evm?.block?.number);
  const sharedBlock = sharedBlockEvidence(report);
  const requested = text(substrate?.historical?.requestedNumber) ?? text(evm?.block?.requestedNumber);
  const substrateError = errorText(substrate?.error);
  const historicalUnavailable = substrate?.historical?.available === false
    || evm?.block?.available === false
    || /Historical(State|Finality)Unavailable/i.test(substrate?.error?.name ?? "");
  const refs = references(
    reference("evidence.substrate.finalized.number", "Native finalized block", nativeBlock),
    reference("evidence.substrate.finalized.hash", "Native block hash", substrate?.finalized?.hash),
    reference("evidence.evm.block.number", "EVM block", evmBlock),
    reference("evidence.evm.block.hash", "EVM block hash", evm?.block?.hash),
    reference("evidence.substrate.historical.requestedNumber", "Requested historical block", requested),
    reference("evidence.substrate.error", "Recorded native error", substrateError),
  );
  const evidenceStatus = sharedBlock.number ? "PASS" : "UNKNOWN";
  const inconsistent = evidenceStatusGuidance(
    check,
    evidenceStatus,
    evidenceStatus === "PASS"
      ? `both interfaces are recorded as available at finalized block ${sharedBlock.number}.`
      : `the report does not establish one shared finalized-block context: ${sharedBlock.issues.join("; ") || "required block evidence is unavailable"}.`,
    refs,
  );
  if (inconsistent) return inconsistent;
  if (evidenceStatus === "PASS") {
    return result(
      `The native and EVM reads were both pinned to available finalized block ${sharedBlock.number}.`,
      "The compared observations share one block height, so differences are not explained by reading different heights.",
      "Equal heights do not prove the two endpoints are honest or expose identical block representations.",
      ["Use the recorded block hashes and per-check evidence when reproducing this result."],
      refs,
    );
  }
  const observed = historicalUnavailable
    ? `The exact historical block${requested ? ` ${requested}` : ""} was not available from every required interface.`
    : sharedBlock.issues.length
      ? `A shared finalized-block context was not established: ${sharedBlock.issues.join("; ")}.`
      : nativeBlock || evmBlock
      ? `A shared block context was not established. Native block: ${nativeBlock ?? "unavailable"}; EVM block: ${evmBlock ?? "unavailable"}.`
      : "The report does not contain two usable block observations.";
  return result(
    observed,
    "FIRMA cannot make a same-block parity claim for dependent asset observations.",
    "Unavailable history or unequal block context is not a demonstrated native/EVM state contradiction.",
    [
      "Retry against endpoints that can serve the exact recorded block.",
      "Do not substitute current state when the requested historical block is unavailable.",
    ],
    refs,
  );
}

function supplyGuidance(report, check) {
  const nativeAsset = report?.evidence?.substrate?.asset;
  const evmCall = report?.evidence?.evm?.calls?.totalSupply;
  const native = integerText(nativeAsset?.supply);
  const evm = evmCall?.ok === true ? integerText(evmCall.value) : null;
  const refs = references(
    reference("evidence.substrate.asset.supply", "Native supply", native),
    reference("evidence.substrate.asset.storageKey", "Native asset storage key", nativeAsset?.storageKey),
    reference("evidence.evm.calls.totalSupply.value", "EVM totalSupply", evm),
    reference("evidence.evm.calls.totalSupply.raw", "Raw EVM result", evmCall?.raw),
    reference("evidence.evm.precompileAddress", "Asset precompile", report?.evidence?.evm?.precompileAddress),
    reference("evidence.evm.calls.totalSupply.error", "Recorded EVM error", errorText(evmCall?.error)),
  );
  const dependency = dependentAssetGate(report);
  const valuesAvailable = nativeAsset?.exists === true && Boolean(native && evm);
  const sharedBlock = sharedBlockEvidence(report);
  const evidenceStatus = dependency || !valuesAvailable || !sharedBlock.number ? "UNKNOWN" : native === evm ? "PASS" : "FAIL";
  const inconsistent = evidenceStatusGuidance(
    check,
    evidenceStatus,
    evidenceStatus === "UNKNOWN"
      ? dependency
        ? `${dependency.reason}.`
        : !valuesAvailable
        ? "a complete pair of valid native and EVM integer supply observations is not available."
        : `the supply observations are not tied to one verified shared finalized block: ${sharedBlock.issues.join("; ")}.`
      : evidenceStatus === "PASS"
        ? `both supply observations equal ${native} base units.`
        : `native supply ${native} and EVM totalSupply ${evm} are different.`,
    refs,
  );
  if (inconsistent) return inconsistent;
  if (dependency) {
    return result(
      `The supply comparison was suppressed because ${dependency.reason}.`,
      "FIRMA cannot establish supply agreement or contradiction while an evaluator prerequisite is unresolved.",
      "Structurally present raw values do not override the runtime-support and native-asset gates.",
      [dependency.nextStep],
      refs,
    );
  }
  if (!nativeAsset || nativeAsset.exists !== true || !native || !evm || !sharedBlock.number) {
    const reason = nativeAsset?.exists === false
      ? "The native asset record was absent, so no native supply observation was available."
      : valuesAvailable && !sharedBlock.number
        ? `The native and EVM supply observations were not tied to one verified shared finalized block: ${sharedBlock.issues.join("; ")}.`
      : unavailableObservation("A complete native/EVM supply pair", evmCall?.error);
    return result(
      reason,
      "FIRMA cannot establish supply agreement or contradiction without two valid same-block integer observations.",
      "An absent asset record, failed RPC call, or malformed value is not a zero supply and is not a mismatch.",
      ["Confirm the asset ID, shared block context, native asset record, and EVM totalSupply response before comparing values."],
      refs,
    );
  }
  if (native !== evm) {
    return result(
      `At the shared block, native supply was ${native} base units and EVM totalSupply was ${evm} base units.`,
      "The two observed supply values contradict each other at the same block.",
      "The mismatch does not by itself identify which interface is incorrect or what caused the difference.",
      [
        "Reproduce both reads at the recorded block.",
        "Confirm the asset ID, precompile address, native storage key, and raw eth_call result before investigating runtime behavior.",
      ],
      refs,
    );
  }
  return result(
    `Native supply and EVM totalSupply were both ${native} base units at the shared block.`,
    "The two read interfaces reported exactly the same total supply for this asset at this block.",
    "This does not prove minting, burning, transfer, event, fee, or future-block behavior.",
    ["Retain the report if this equality is an integration or release requirement."],
    refs,
  );
}

function mappingGuidance(report, check) {
  const mapping = report?.evidence?.substrate?.accountMapping;
  const assessment = mappingEvidence(report);
  const h160 = assessment.h160;
  const accountId = assessment.accountId;
  const refs = references(
    reference("evidence.substrate.accountMapping.h160", "EVM address", h160),
    reference("evidence.substrate.accountMapping.accountId", "Native AccountId", accountId),
    reference("evidence.substrate.accountMapping.storageKey", "Revive mapping storage key", mapping?.storageKey),
  );
  const dependency = dependentAssetGate(report);
  const mappingAvailable = assessment.kind === "VALID";
  const evidenceStatus = dependency ? "UNKNOWN" : mappingAvailable ? "PASS" : "UNKNOWN";
  const inconsistent = evidenceStatusGuidance(
    check,
    evidenceStatus,
    dependency
      ? `${dependency.reason}.`
      : mappingAvailable
      ? `the evidence contains a Revive mapping from ${h160} to ${accountId}.`
      : `${assessment.reason}.`,
    refs,
  );
  if (inconsistent) return inconsistent;
  if (dependency) {
    return result(
      `The Revive mapping conclusion was suppressed because ${dependency.reason}.`,
      "FIRMA cannot authorize a runtime-backed mapping conclusion while an evaluator prerequisite is unresolved.",
      "A structurally valid raw mapping does not override the runtime-support or native-asset gate.",
      [dependency.nextStep],
      refs,
    );
  }
  if (mappingAvailable) {
    return result(
      `Revive storage mapped ${h160} to native account ${accountId}.`,
      "FIRMA has a runtime-backed native account to use for this address's balance comparison.",
      "The mapping does not prove account ownership, transaction history, or any non-asset balance.",
      ["Use the recorded AccountId and mapping storage key when reproducing the native balance read."],
      refs,
    );
  }
  return result(
    assessment.kind === "MISSING"
      ? `No usable Revive OriginalAccount mapping was observed for ${h160} at the checked block.`
      : `The Revive mapping evidence is incomplete or malformed: ${assessment.reason}.`,
    "FIRMA cannot select a runtime-authoritative native AccountId for the balance comparison.",
    "A missing mapping does not prove the address is invalid, either balance is zero, or the chain is malfunctioning.",
    [
      "Confirm the EVM address and inspect the recorded Revive mapping storage key.",
      "If appropriate, compare an address already known to have a runtime-backed mapping; do not guess or derive an AccountId.",
    ],
    refs,
  );
}

function balanceGuidance(report, check) {
  const substrate = report?.evidence?.substrate;
  const nativeBalance = substrate?.balance;
  const mapping = substrate?.accountMapping;
  const evmCall = report?.evidence?.evm?.calls?.balanceOf;
  const native = nativeBalance?.exists === true ? integerText(nativeBalance.value) : null;
  const evm = evmCall?.ok === true ? integerText(evmCall.value) : null;
  const refs = references(
    reference("evidence.substrate.accountMapping.accountId", "Mapped native AccountId", mapping?.accountId),
    reference("evidence.substrate.balance.value", "Native balance", native),
    reference("evidence.substrate.balance.storageKey", "Native balance storage key", nativeBalance?.storageKey),
    reference("evidence.evm.calls.balanceOf.value", "EVM balanceOf", evm),
    reference("evidence.evm.calls.balanceOf.raw", "Raw EVM result", evmCall?.raw),
    reference("evidence.evm.calls.balanceOf.error", "Recorded EVM error", errorText(evmCall?.error)),
  );
  const dependency = dependentAssetGate(report);
  const mappingAssessment = mappingEvidence(report);
  const mappingAvailable = mappingAssessment.kind === "VALID";
  const valuesAvailable = mappingAvailable && nativeBalance?.exists === true && Boolean(native && evm);
  const sharedBlock = sharedBlockEvidence(report);
  const evidenceStatus = dependency || !valuesAvailable || !sharedBlock.number ? "UNKNOWN" : native === evm ? "PASS" : "FAIL";
  const inconsistent = evidenceStatusGuidance(
    check,
    evidenceStatus,
    evidenceStatus === "UNKNOWN"
      ? dependency
        ? `${dependency.reason}.`
        : !valuesAvailable
        ? `${mappingAvailable ? "a complete pair of native and EVM integer balance observations is not available" : mappingAssessment.reason}.`
        : `the balance observations are not tied to one verified shared finalized block: ${sharedBlock.issues.join("; ")}.`
      : evidenceStatus === "PASS"
        ? `both balance observations equal ${native} base units.`
        : `native balance ${native} and EVM balanceOf ${evm} are different.`,
    refs,
  );
  if (inconsistent) return inconsistent;
  if (dependency) {
    return result(
      `The balance comparison was suppressed because ${dependency.reason}.`,
      "FIRMA cannot establish balance agreement or contradiction while an evaluator prerequisite is unresolved.",
      "Structurally present mapping or balance values do not override the runtime-support and native-asset gates.",
      [dependency.nextStep],
      refs,
    );
  }
  if (!native || !evm || !mappingAvailable || !sharedBlock.number) {
    let observed;
    if (!mappingAvailable) observed = `The balance comparison has no valid observed Revive mapping: ${mappingAssessment.reason}.`;
    else if (nativeBalance?.exists === false) observed = "The mapped native account had no Assets account record at the checked block.";
    else if (valuesAvailable && !sharedBlock.number) observed = `The native and EVM balance observations were not tied to one verified shared finalized block: ${sharedBlock.issues.join("; ")}.`;
    else observed = unavailableObservation("A complete native/EVM balance pair", evmCall?.error);
    return result(
      observed,
      "FIRMA cannot establish balance agreement or contradiction without a mapping and two valid same-block balance observations.",
      "A missing native account record or unavailable call is not evidence that either balance is zero.",
      [
        "Inspect the Revive mapping and native Assets account storage key at the recorded block.",
        "Retry any unavailable EVM balanceOf read before investigating a balance mismatch.",
      ],
      refs,
    );
  }
  if (native !== evm) {
    return result(
      `At the shared block, the mapped native balance was ${native} base units and EVM balanceOf was ${evm} base units.`,
      "The two observed account balances contradict each other at the same block.",
      "The mismatch does not identify which interface is incorrect, who controls the account, or what caused the difference.",
      [
        "Reproduce the mapping and both balance reads at the recorded block.",
        "Confirm the asset ID, account, storage key, precompile address, and raw eth_call result.",
      ],
      refs,
    );
  }
  return result(
    `The mapped native balance and EVM balanceOf were both ${native} base units at the shared block.`,
    "The two read interfaces reported exactly the same asset balance for the mapped account at this block.",
    "This does not prove account ownership, transfers, approvals, events, fees, or balances at other blocks.",
    ["Retain the mapping and balance evidence if this equality is an integration requirement."],
    refs,
  );
}

function metadataGuidance(report, check) {
  const native = report?.evidence?.substrate?.asset?.metadata;
  const calls = report?.evidence?.evm?.calls;
  const fields = ["name", "symbol", "decimals"];
  const nativeExists = native?.exists === true;
  const evmMissing = fields.every((field) => calls?.[field]?.kind === "metadata-missing");
  const valuesAvailable = nativeExists && fields.every((field) => (
    typeof native?.[field] === "string"
    && calls?.[field]?.ok === true
    && typeof calls[field].value === "string"
  ));
  const mismatches = valuesAvailable
    ? fields.filter((field) => String(native[field]) !== String(calls[field].value))
    : [];
  const refs = references(
    reference("evidence.substrate.asset.metadata.storageKey", "Native metadata storage key", native?.storageKey),
    ...fields.flatMap((field) => [
      reference(`evidence.substrate.asset.metadata.${field}`, `Native ${field}`, native?.[field]),
      reference(`evidence.evm.calls.${field}.value`, `EVM ${field}`, calls?.[field]?.ok === true ? calls[field].value : null),
      reference(`evidence.evm.calls.${field}.kind`, `EVM ${field} outcome`, calls?.[field]?.kind),
      reference(`evidence.evm.calls.${field}.error`, `EVM ${field} error`, errorText(calls?.[field]?.error)),
    ]),
  );
  const dependency = dependentAssetGate(report);
  const evmHasValue = fields.some((field) => calls?.[field]?.ok === true && typeof calls[field].value === "string");
  const evmMissingField = nativeExists && fields.find((field) => calls?.[field]?.kind === "metadata-missing");
  const sharedBlock = sharedBlockEvidence(report);
  const evidenceStatus = dependency
    ? "UNKNOWN"
    : !sharedBlock.number
    ? "UNKNOWN"
    : native?.exists === false && evmMissing
    ? "PASS"
    : native?.exists === false && evmHasValue
      ? "FAIL"
      : valuesAvailable
        ? mismatches.length ? "FAIL" : "PASS"
        : evmMissingField
          ? "FAIL"
          : "UNKNOWN";
  const evidenceDescription = evidenceStatus === "UNKNOWN"
    ? dependency
      ? `${dependency.reason}.`
      : !sharedBlock.number && (native?.exists === false && evmMissing || valuesAvailable || evmMissingField || (native?.exists === false && evmHasValue))
      ? `the metadata observations are not tied to one verified shared finalized block: ${sharedBlock.issues.join("; ")}.`
      : "the report does not contain a complete, recognized pair of metadata observations."
    : native?.exists === false && evmMissing
      ? "both interfaces consistently represent metadata as absent."
      : native?.exists === false
        ? "the EVM interface contains metadata while native metadata storage is absent."
        : evmMissingField
          ? `native ${evmMissingField} metadata exists while the EVM interface reports that field missing.`
          : mismatches.length
            ? `the available metadata differs for: ${mismatches.join(", ")}.`
            : "the available native and EVM metadata fields match exactly.";
  const inconsistent = evidenceStatusGuidance(check, evidenceStatus, evidenceDescription, refs);
  if (inconsistent) return inconsistent;
  if (dependency) {
    return result(
      `The metadata comparison was suppressed because ${dependency.reason}.`,
      "FIRMA cannot establish metadata agreement or contradiction while an evaluator prerequisite is unresolved.",
      "Structurally present metadata values do not override the runtime-support and native-asset gates.",
      [dependency.nextStep],
      refs,
    );
  }
  if (sharedBlock.number && native?.exists === false && evmMissing) {
    return result(
      "Native metadata storage was absent, and the EVM name, symbol, and decimals calls all returned the recognized metadata-missing result.",
      "Both interfaces consistently represented metadata as absent at this block.",
      "This does not prove metadata never existed, will remain absent, or cannot be added through an authorized write.",
      ["Treat metadata as absent for this observation; do not substitute empty name, symbol, or decimal values."],
      refs,
    );
  }
  if (sharedBlock.number && valuesAvailable && mismatches.length === 0) {
    return result(
      `Native and EVM metadata matched: name “${native.name}”, symbol “${native.symbol}”, decimals ${native.decimals}.`,
      "The name, symbol, and decimal observations were equal across both interfaces at this block.",
      "This does not prove metadata write behavior, authenticity of the labels, or values at another block.",
      ["Retain the native storage key and raw EVM responses when metadata parity is an integration requirement."],
      refs,
    );
  }
  if (evidenceStatus === "FAIL") {
    const detail = mismatches.length
      ? mismatches.map((field) => `${field}: native “${native[field]}”, EVM “${calls[field].value}”`).join("; ")
      : evmMissingField
        ? `native ${evmMissingField} metadata existed while the EVM interface reported that field missing`
      : nativeExists
        ? "native metadata existed while at least one EVM metadata field was reported missing"
        : "the EVM interface returned metadata while native metadata storage was absent";
    return result(
      `The metadata observations contradicted each other: ${detail}.`,
      "At least one native/EVM metadata claim was demonstrably inconsistent at the shared block.",
      "The contradiction does not identify which interface is incorrect or what caused the difference.",
      [
        "Reproduce each metadata field at the recorded block.",
        "Inspect the native metadata storage key and the raw EVM calls for only the fields that differ.",
      ],
      refs,
    );
  }
  return result(
    "The report did not contain a complete, recognized pair of native and EVM metadata observations.",
    "FIRMA cannot establish metadata agreement or contradiction from malformed, undecodable, or unavailable fields.",
    "Unavailable metadata evidence is not equivalent to absent metadata and is not a mismatch.",
    ["Inspect the native metadata-presence observation and retry any failed EVM metadata calls at the same block."],
    refs,
  );
}

function fallbackGuidance(check) {
  const title = text(check?.title) ?? "verification check";
  const status = VALID_STATUS.has(check?.status) ? check.status : "unrecognized";
  return result(
    `The report contains ${title} with technical status ${status}, but no complete structured observation was available for guidance.`,
    "No additional conclusion can be established from incomplete or unrecognized presentation data.",
    "This guidance does not replace the report's technical verdict or repair malformed evidence.",
    ["Inspect the original check and raw report evidence before acting on this result."],
    references(reference(`verdict.checks[${text(check?.id) ?? "unknown"}]`, "Technical check", text(check?.summary))),
    "INCOMPLETE",
  );
}

const GUIDANCE = Object.freeze({
  "network.substrate": (report, check) => networkGuidance(report, check, "substrate"),
  "network.evm": (report, check) => networkGuidance(report, check, "evm"),
  "identity.chainId": chainIdentityGuidance,
  "runtime.support": runtimeGuidance,
  "context.block": blockGuidance,
  "asset.supply": supplyGuidance,
  "account.mapping": mappingGuidance,
  "asset.balance": balanceGuidance,
  "asset.metadata": metadataGuidance,
});

export function guidanceForCheck(report, check) {
  if (!check || typeof check !== "object") return fallbackGuidance(check);
  const create = GUIDANCE[check.id];
  return create ? create(report, check) : fallbackGuidance(check);
}

function blockContext(report) {
  const shared = sharedBlockEvidence(report);
  const native = integerText(report?.evidence?.substrate?.finalized?.number);
  const evm = integerText(report?.evidence?.evm?.block?.number);
  if (shared.number) return `Native and EVM evidence was collected at available finalized block ${shared.number}.`;
  if (shared.issues.length) return `A shared finalized block was not established: ${shared.issues.join("; ")}.`;
  if (native || evm) return `A shared block was not established (native: ${native ?? "unavailable"}; EVM: ${evm ?? "unavailable"}).`;
  const requested = text(report?.evidence?.substrate?.historical?.requestedNumber)
    ?? text(report?.evidence?.evm?.block?.requestedNumber);
  return requested
    ? `The requested historical block ${requested} was not available from every required interface.`
    : "No complete block context was available.";
}

export function projectInvestigation(report) {
  const checks = Array.isArray(report?.verdict?.checks) ? report.verdict.checks : [];
  const projectedChecks = checks.map((check) => Object.freeze({
    id: text(check?.id) ?? "unknown",
    status: VALID_STATUS.has(check?.status) ? check.status : "UNKNOWN",
    guidance: guidanceForCheck(report, check),
  }));
  const firstFail = projectedChecks.find((item) => item.status === "FAIL");
  const firstUnknown = projectedChecks.find((item) => item.status === "UNKNOWN");
  const firstIntegrityIssue = projectedChecks.find((item) => item.guidance.integrity !== "SUPPORTED");
  const primary = firstIntegrityIssue ?? firstFail ?? firstUnknown ?? projectedChecks[0] ?? null;
  const overall = firstFail ? "FAIL" : firstUnknown || !projectedChecks.length ? "UNKNOWN" : "PASS";
  const primaryFinding = overall === "PASS" && !firstIntegrityIssue
    ? "All required verification checks were supported by matching evidence."
    : primary?.guidance.observed ?? "The report does not contain a usable primary finding.";
  const priorityIssue = firstIntegrityIssue
    ? "The reported status and supporting evidence are inconsistent and require independent reproduction."
    : overall === "FAIL"
    ? "A demonstrated contradiction takes priority over unresolved checks."
    : overall === "UNKNOWN"
      ? "At least one required observation remains unresolved, so FIRMA does not claim success."
      : "No contradiction or unresolved required check was reported.";
  const nextAction = primary?.guidance.nextSteps[0]
    ?? "Inspect the original report before taking further action.";
  return Object.freeze({
    overall,
    primaryFinding,
    blockContext: blockContext(report),
    priorityIssue,
    nextAction,
    hasIntegrityIssue: Boolean(firstIntegrityIssue),
    checks: Object.freeze(projectedChecks),
  });
}

export function assessReportIntegrity(report, investigation = projectInvestigation(report)) {
  const issues = [];
  const verdict = isRecord(report?.verdict) ? report.verdict : null;
  const checks = Array.isArray(verdict?.checks) ? verdict.checks : [];
  const reportedOverall = VALID_STATUS.has(verdict?.overall) ? verdict.overall : null;

  if (!isRecord(report)) issues.push("the response is not a report object");
  if (report?.schema !== "firma.report.v1") issues.push("the report schema is missing or unrecognized");
  if (!isRecord(report?.evidence)) issues.push("the report evidence is missing or malformed");
  if (!verdict) issues.push("the reported verdict is missing or malformed");
  if (!Array.isArray(verdict?.checks)) issues.push("the reported check list is missing or malformed");
  if (!reportedOverall) issues.push("the reported overall verdict is missing or unrecognized");

  const seen = new Map();
  for (const [index, check] of checks.entries()) {
    if (!isRecord(check)) {
      issues.push(`check ${index + 1} is not an object`);
      continue;
    }
    if (!text(check.id)) issues.push(`check ${index + 1} has no recognizable ID`);
    else if (!REQUIRED_CHECK_IDS.includes(check.id)) issues.push(`check ${index + 1} has unknown ID ${check.id}`);
    else seen.set(check.id, (seen.get(check.id) ?? 0) + 1);
    if (!VALID_STATUS.has(check.status)) issues.push(`check ${index + 1} has a missing or unexpected status`);
    if (!text(check.title)) issues.push(`check ${index + 1} has no usable title`);
    if (!text(check.summary)) issues.push(`check ${index + 1} has no usable summary`);
    if (!isRecord(check.evidence)) issues.push(`check ${index + 1} has malformed evidence`);
  }
  for (const id of REQUIRED_CHECK_IDS) {
    const count = seen.get(id) ?? 0;
    if (count === 0) issues.push(`required check ${id} is missing`);
    if (count > 1) issues.push(`required check ${id} appears more than once`);
  }

  const statusesRecognized = checks.length > 0 && checks.every((check) => isRecord(check) && VALID_STATUS.has(check.status));
  const checkOverall = statusesRecognized
    ? checks.some((check) => check.status === "FAIL")
      ? "FAIL"
      : checks.some((check) => check.status === "UNKNOWN") ? "UNKNOWN" : "PASS"
    : null;
  if (reportedOverall && checkOverall && reportedOverall !== checkOverall) {
    issues.push(`reported overall ${reportedOverall} does not match the individual check result ${checkOverall}`);
  }

  const counts = isRecord(verdict?.counts) ? verdict.counts : null;
  if (!counts) issues.push("the reported verdict counts are missing or malformed");
  for (const status of VALID_STATUS) {
    const expected = checks.filter((check) => check?.status === status).length;
    if (!Number.isSafeInteger(counts?.[status]) || counts[status] < 0 || counts[status] !== expected) {
      issues.push(`the reported ${status} count does not match the check list`);
    }
  }

  for (const item of investigation.checks) {
    if (item.guidance.integrity !== "SUPPORTED") {
      issues.push(`check ${item.id} has status or evidence that cannot be reconciled`);
    }
  }

  const uniqueIssues = [...new Set(issues)];
  return Object.freeze({
    trusted: uniqueIssues.length === 0,
    reportedOverall,
    checkOverall,
    evidenceSupportedOverall: uniqueIssues.length === 0 ? investigation.overall : null,
    issues: Object.freeze(uniqueIssues),
  });
}
