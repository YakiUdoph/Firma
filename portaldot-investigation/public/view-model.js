export const LABEL = Object.freeze({
  PASS: "Passed",
  FAIL: "Failed",
  UNKNOWN: "Couldn't verify",
});

export const VERDICT_COPY = Object.freeze({
  PASS: "All required checks agreed at the same finalized block.",
  FAIL: "At least one required check found a proven difference between the two interfaces.",
  UNKNOWN: "FIRMA could not complete every required check, so it does not claim the asset passed or failed.",
});

function available(value) {
  return value == null || value === "" ? "Unavailable" : String(value);
}

export function reportContext(report) {
  const substrate = report?.evidence?.substrate;
  const evm = report?.evidence?.evm;
  const completedAt = report?.completedAt;
  const timestamp = completedAt && !Number.isNaN(Date.parse(completedAt))
    ? new Date(completedAt).toLocaleString()
    : "Unavailable";
  return [
    { label: "Finalized block", value: available(substrate?.finalized?.number), title: available(substrate?.finalized?.hash) },
    { label: "Native chain", value: available(substrate?.identity?.chain), title: available(substrate?.identity?.chain) },
    { label: "Runtime", value: substrate?.runtime ? `${available(substrate.runtime.specName)}/${available(substrate.runtime.specVersion)}` : "Unavailable", title: available(substrate?.runtime?.fingerprint?.runtimeCodeHash) },
    { label: "EVM chain ID", value: available(evm?.identity?.chainId), title: available(evm?.identity?.chainIdHex) },
    { label: "Evidence time", value: timestamp, title: available(completedAt) },
  ];
}

export function evidenceFilename(report) {
  const assetId = String(report?.input?.assetId ?? "unknown").replaceAll(/[^0-9]/g, "") || "unknown";
  const timestamp = String(report?.completedAt ?? "undated").replaceAll(":", "-");
  return `firma-${assetId}-${timestamp}.json`;
}
