import { LABEL, VERDICT_COPY, evidenceFilename, reportContext } from "/view-model.js";
import { assessReportIntegrity, guidanceForCheck, projectInvestigation } from "/investigation.js";
import {
  anchoringFilename,
  connectWallet,
  formatTPotBaseUnits,
  inspectAnchorTransaction,
  submitAnchorTransaction,
} from "/onchain.js";
import {
  closeNativeInspection,
  connectSubWallet,
  inspectNativeAnchor,
  submitNativeAnchor,
} from "/native-wallet.js";

const form = document.querySelector("#verify-form");
const button = document.querySelector("#run-button");
const buttonLabel = button.querySelector(".button-label");
const buttonIcon = button.querySelector(".button-icon");
const errorBox = document.querySelector("#form-error");
const progress = document.querySelector("#progress");
const result = document.querySelector("#result");
const checks = document.querySelector("#checks");
const context = document.querySelector("#context");
const verdictTitle = document.querySelector("#verdict-title");
const verdictSymbol = document.querySelector("#verdict-symbol");
const verdictSummary = document.querySelector("#verdict-summary");
const verdictCounts = document.querySelector("#verdict-counts");
const investigationSummary = document.querySelector("#investigation-summary");
const evidenceJson = document.querySelector("#evidence-json");
const copyButton = document.querySelector("#copy-button");
const COUNT_LABEL = Object.freeze({
  PASS: "Checks passed",
  FAIL: "Checks failed",
  UNKNOWN: "Not verified",
  VERIFIED: "Claims verified",
  MISMATCH: "Claims differ",
  UNAVAILABLE: "Not available",
});
const INDEPENDENT_LABEL = Object.freeze({ VERIFIED: "Verified", MISMATCH: "Mismatch", UNAVAILABLE: "Unavailable" });
const MAX_REPORT_BYTES = 262_144;
const VALID_VERDICT_STATUS = new Set(["PASS", "FAIL", "UNKNOWN"]);
let latestReport = null;
let anchorInspection = null;
let anchorReportText = null;
let anchorTransactionHash = null;
let latestAnchorEvidence = null;
let nativeSession = null;
let nativeInspection = null;
let nativeSidecar = null;
let verifiedImportedReport = null;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2) ?? "null";
  } catch {
    return "Evidence could not be displayed safely.";
  }
}

function normalizeCheckForDisplay(check, index) {
  if (!isRecord(check)) {
    return {
      id: "unknown",
      title: `Incomplete check ${index + 1}`,
      status: "UNKNOWN",
      summary: "This check is malformed and cannot support a verification conclusion.",
      evidence: {},
    };
  }
  const status = VALID_VERDICT_STATUS.has(check.status) ? check.status : "UNKNOWN";
  return {
    ...check,
    id: typeof check.id === "string" && check.id ? check.id : "unknown",
    title: typeof check.title === "string" && check.title ? check.title : `Incomplete check ${index + 1}`,
    status,
    summary: typeof check.summary === "string" && check.summary
      ? check.summary
      : "This check is incomplete and cannot support a verification conclusion.",
    evidence: isRecord(check.evidence) ? check.evidence : {},
  };
}

function reportForDisplay(report) {
  const source = isRecord(report) ? report : {};
  const verdict = isRecord(source.verdict) ? source.verdict : {};
  const sourceChecks = Array.isArray(verdict.checks) ? verdict.checks : [];
  const checks = sourceChecks.map((check, index) => normalizeCheckForDisplay(check, index));
  const status = VALID_VERDICT_STATUS.has(verdict.overall) ? verdict.overall : "UNKNOWN";
  return { source, verdict, sourceChecks, checks, status };
}

function contextItem({ label, value, title }) {
  const wrapper = document.createElement("div");
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = value;
  detail.title = title;
  wrapper.append(term, detail);
  return wrapper;
}

function countItem(status, count) {
  const item = document.createElement("div");
  item.dataset.status = status;
  const number = document.createElement("strong");
  number.textContent = Number.isSafeInteger(count) && count >= 0 ? String(count) : "—";
  const label = document.createElement("span");
  label.textContent = COUNT_LABEL[status];
  const code = document.createElement("small");
  code.textContent = status;
  item.append(number, label, code);
  return item;
}

function evidenceDetails(evidence) {
  const details = document.createElement("details");
  details.className = "check-evidence";
  const summary = document.createElement("summary");
  summary.textContent = "Show technical evidence";
  const pre = document.createElement("pre");
  pre.tabIndex = 0;
  pre.textContent = safeJson(evidence);
  details.append(summary, pre);
  return details;
}

function guidanceSection(titleText, bodyText) {
  const section = document.createElement("section");
  const title = document.createElement("h5");
  title.textContent = titleText;
  const body = document.createElement("p");
  body.textContent = bodyText;
  section.append(title, body);
  return section;
}

function investigationDetails(item, guidance) {
  const details = document.createElement("details");
  details.className = "investigation-guidance";
  details.open = item.status !== "PASS";
  const summary = document.createElement("summary");
  summary.textContent = "Investigation guidance";
  const content = document.createElement("div");
  content.className = "guidance-grid";
  const nextSteps = document.createElement("section");
  const nextTitle = document.createElement("h5");
  nextTitle.textContent = "WHAT TO INVESTIGATE NEXT";
  const list = document.createElement("ol");
  for (const step of guidance.nextSteps) {
    const item = document.createElement("li");
    item.textContent = step;
    list.append(item);
  }
  nextSteps.append(nextTitle, list);
  content.append(
    guidanceSection("WHAT FIRMA OBSERVED", guidance.observed),
    guidanceSection("WHAT THIS PROVES", guidance.proves),
    guidanceSection("WHAT IT DOES NOT PROVE", guidance.doesNotProve),
    nextSteps,
  );
  if (guidance.evidenceReferences.length) {
    const evidence = document.createElement("section");
    evidence.className = "guidance-references";
    const evidenceTitle = document.createElement("h5");
    evidenceTitle.textContent = "RELEVANT EVIDENCE";
    const definitions = document.createElement("dl");
    for (const entry of guidance.evidenceReferences) {
      const wrapper = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = entry.label;
      term.title = entry.path;
      const value = document.createElement("dd");
      value.textContent = entry.value;
      wrapper.append(term, value);
      definitions.append(wrapper);
    }
    evidence.append(evidenceTitle, definitions);
    content.append(evidence);
  }
  details.append(summary, content);
  return details;
}

function checkRow(item, index, labels = LABEL, guidance = null) {
  const row = document.createElement("article");
  row.className = "check";
  row.dataset.status = item.status;
  const indexLabel = document.createElement("span");
  indexLabel.className = "check-index";
  indexLabel.textContent = String(index + 1).padStart(2, "0");
  const body = document.createElement("div");
  body.className = "check-body";
  const heading = document.createElement("div");
  heading.className = "check-heading";
  const title = document.createElement("h4");
  title.textContent = item.title;
  const badge = document.createElement("span");
  badge.className = "status-badge";
  const marker = document.createElement("span");
  marker.setAttribute("aria-hidden", "true");
  const humanStatus = document.createTextNode(labels[item.status] ?? item.status);
  const statusCode = document.createElement("small");
  statusCode.textContent = item.status;
  badge.append(marker, humanStatus, statusCode);
  heading.append(title, badge);
  const summary = document.createElement("p");
  summary.textContent = item.summary;
  body.append(heading, summary);
  if (guidance) body.append(investigationDetails(item, guidance));
  body.append(evidenceDetails(item.evidence));
  row.append(indexLabel, body);
  return row;
}

function renderInvestigationSummary(
  report,
  investigation = projectInvestigation(report),
  displayStatus = investigation.overall,
  integrity = assessReportIntegrity(report, investigation),
) {
  investigationSummary.dataset.status = displayStatus;
  const values = [
    ["Reported verdict", integrity.reportedOverall ? `${LABEL[integrity.reportedOverall]} (${integrity.reportedOverall})` : "Missing or unrecognized"],
    ["Evidence-supported findings", integrity.evidenceSupportedOverall
      ? `${LABEL[integrity.evidenceSupportedOverall]} (${integrity.evidenceSupportedOverall})`
      : "Couldn't establish — report integrity is unresolved"],
    ["Report integrity", integrity.trusted ? "Consistent" : "Untrusted — independently reproduce before relying on it"],
    ["Primary finding", investigation.primaryFinding],
    ["Block context", investigation.blockContext],
    ["Priority", investigation.priorityIssue],
    ["Next action", investigation.nextAction],
  ];
  investigationSummary.replaceChildren(...values.map(([label, value]) => {
    const item = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    item.append(term, detail);
    return item;
  }));
  return investigation;
}

function setReportLoading(loading) {
  const reportForm = document.querySelector("#report-form");
  const reportButton = document.querySelector("#report-button");
  reportForm.setAttribute("aria-busy", String(loading));
  document.querySelector("#report-progress").hidden = !loading;
  for (const input of reportForm.querySelectorAll("input, button")) input.disabled = loading;
  reportButton.querySelector(".button-label").textContent = loading ? "Checking evidence" : "Check evidence";
  reportButton.querySelector(".button-icon").classList.toggle("is-loading", loading);
}

function showReportError(message) {
  const box = document.querySelector("#report-error");
  box.textContent = message;
  box.hidden = false;
  box.focus();
}

function renderIndependent(response) {
  const independent = response.independent;
  const status = independent.overall;
  const panel = document.querySelector("#report-result");
  panel.hidden = false;
  panel.dataset.status = status;
  const title = document.querySelector("#independent-title");
  title.textContent = INDEPENDENT_LABEL[status];
  document.querySelector("#independent-symbol").textContent = status === "VERIFIED" ? "\u2713" : status === "MISMATCH" ? "\u00d7" : "?";
  document.querySelector("#independent-summary").textContent = independent.summary;
  document.querySelector("#imported-verdict").textContent = response.importedVerdict.overall;
  document.querySelector("#imported-block").textContent = independent.requestedBlock.number;
  const commitment = document.querySelector("#report-commitment");
  commitment.textContent = response.commitment.computed;
  commitment.title = response.commitment.computed;
  document.querySelector("#independent-counts").replaceChildren(
    ...["VERIFIED", "MISMATCH", "UNAVAILABLE"].map((item) => countItem(item, independent.counts?.[item])),
  );
  document.querySelector("#independent-checks").replaceChildren(
    ...independent.checks.map((item, index) => checkRow(item, index, INDEPENDENT_LABEL)),
  );
  document.querySelector("#independent-check-count").textContent = `${independent.checks.length} checks`;
  document.querySelector("#independent-checks").closest("details").open = false;
  document.querySelector("#independent-json").textContent = JSON.stringify(response, null, 2);
  const useImportedButton = document.querySelector("#use-imported-report-button");
  const eligibleForAnchoring = status === "VERIFIED"
    && response.importedVerdict?.overall === "PASS"
    && isRecord(response.importedReport);
  verifiedImportedReport = eligibleForAnchoring ? response.importedReport : null;
  useImportedButton.hidden = !eligibleForAnchoring;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  title.tabIndex = -1;
  title.focus({ preventScroll: true });
}

document.querySelector("#use-imported-report-button").addEventListener("click", () => {
  if (!verifiedImportedReport) return showReportError("Independently verify a genuine PASS report before anchoring it.");
  render(verifiedImportedReport);
  document.querySelector("#anchor-button").focus({ preventScroll: true });
});

function downloadJson(value, filename) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function postOnchainProof(body) {
  const response = await fetch("/api/onchain-proof", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
  return value;
}

function showAnchorError(message) {
  const box = document.querySelector("#anchor-error");
  box.textContent = message;
  box.hidden = false;
  box.focus();
}

function renderOnchainProof(response, { scroll = true } = {}) {
  const status = response.overall;
  const panel = document.querySelector("#onchain-proof-result");
  panel.hidden = false;
  panel.dataset.status = status;
  document.querySelector("#onchain-proof-symbol").textContent = status === "VERIFIED" ? "\u2713" : status === "MISMATCH" ? "\u00d7" : "?";
  const title = document.querySelector("#onchain-proof-result-title");
  title.textContent = INDEPENDENT_LABEL[status] ?? "Unavailable";
  document.querySelector("#onchain-proof-summary").textContent = response.summary;
  document.querySelector("#onchain-original-verdict").textContent = response.report.originalVerdict;
  document.querySelector("#onchain-commitment").textContent = response.report.commitment;
  document.querySelector("#onchain-hash").textContent = response.transactionHash;
  document.querySelector("#onchain-counts").replaceChildren(
    ...["VERIFIED", "MISMATCH", "UNAVAILABLE"].map((item) => countItem(item, response.counts?.[item])),
  );
  document.querySelector("#onchain-checks").replaceChildren(
    ...response.checks.map((item, index) => checkRow(item, index, INDEPENDENT_LABEL)),
  );
  document.querySelector("#onchain-check-count").textContent = `${response.checks.length} checks`;
  document.querySelector("#onchain-checks").closest("details").open = false;
  document.querySelector("#onchain-json").textContent = safeJson(response);
  if (scroll) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  title.tabIndex = -1;
  if (scroll) title.focus({ preventScroll: true });
}

async function verifySubmittedAnchor() {
  if (!anchorReportText || (!anchorTransactionHash && !nativeSidecar)) return;
  const progress = document.querySelector("#anchor-progress");
  const error = document.querySelector("#anchor-error");
  const retry = document.querySelector("#retry-anchor-proof-button");
  progress.hidden = false;
  error.hidden = true;
  retry.disabled = true;
  try {
    latestAnchorEvidence = await postOnchainProof(nativeSidecar
      ? { action: "verify", reportText: anchorReportText, anchorEvidenceText: JSON.stringify(nativeSidecar) }
      : { action: "verify", reportText: anchorReportText, transactionHash: anchorTransactionHash });
    document.querySelector("#anchor-result-summary").textContent = `${INDEPENDENT_LABEL[latestAnchorEvidence.overall]}: ${latestAnchorEvidence.summary}`;
    document.querySelector("#download-anchor-button").disabled = false;
    renderOnchainProof(latestAnchorEvidence, { scroll: false });
  } catch (requestError) {
    showAnchorError(requestError instanceof Error ? requestError.message : "The transaction evidence could not be checked.");
  } finally {
    progress.hidden = true;
    retry.disabled = false;
  }
}

function setLoading(loading) {
  form.setAttribute("aria-busy", String(loading));
  progress.hidden = !loading;
  button.disabled = loading;
  for (const input of form.querySelectorAll("input")) input.disabled = loading;
  buttonLabel.textContent = loading ? "Checking asset" : "Check asset";
  buttonIcon.textContent = loading ? "" : "\u2197";
  buttonIcon.classList.toggle("is-loading", loading);
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  errorBox.focus();
}

function render(report) {
  latestReport = report;
  anchorInspection = null;
  if (nativeInspection) closeNativeInspection(nativeInspection);
  nativeSession = null;
  nativeInspection = null;
  nativeSidecar = null;
  anchorReportText = null;
  anchorTransactionHash = null;
  latestAnchorEvidence = null;
  document.querySelector("#anchor-button").disabled = false;
  document.querySelector("#anchor-panel").hidden = true;
  const display = reportForDisplay(report);
  const investigation = projectInvestigation(report);
  const integrity = assessReportIntegrity(report, investigation);
  const incomplete = !integrity.trusted;
  const status = incomplete ? "UNKNOWN" : display.status;
  result.hidden = false;
  result.dataset.status = status;
  verdictTitle.textContent = LABEL[status];
  verdictSymbol.textContent = status === "PASS" ? "\u2713" : status === "FAIL" ? "\u00d7" : "?";
  verdictSummary.textContent = incomplete
    ? `FIRMA cannot trust this report's ${integrity.reportedOverall ?? "unrecognized"} verdict because its checks, evidence, or integrity signals do not agree. The original report remains unchanged and available for inspection.`
    : VERDICT_COPY[status];
  verdictCounts.replaceChildren(...["PASS", "FAIL", "UNKNOWN"].map((item) => countItem(item, display.verdict.counts?.[item])));
  renderInvestigationSummary(report, investigation, status, integrity);
  context.replaceChildren(...reportContext(display.source).map(contextItem));
  checks.replaceChildren(...display.checks.map((item, index) => checkRow(
    item,
    index,
    LABEL,
    investigation.checks[index]?.guidance ?? guidanceForCheck(display.source, display.sourceChecks[index]),
  )));
  document.querySelector("#asset-check-count").textContent = `${display.checks.length} checks`;
  checks.closest("details").open = false;
  evidenceJson.textContent = safeJson(report);
  if (incomplete) {
    const detail = integrity.issues.length ? ` ${integrity.issues.join("; ")}.` : "";
    showError(`FIRMA received an untrusted, incomplete or internally inconsistent report.${detail} Independently reproduce the report before relying on its verdict.`);
  }
  result.scrollIntoView({ behavior: "smooth", block: "start" });
  verdictTitle.tabIndex = -1;
  verdictTitle.focus({ preventScroll: true });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  setLoading(true);
  try {
    const response = await fetch("/api/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetId: form.assetId.value.trim(), account: form.account.value.trim() }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    render(body);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Verification failed unexpectedly.");
  } finally {
    setLoading(false);
  }
});

document.querySelector("#report-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorBox = document.querySelector("#report-error");
  errorBox.hidden = true;
  const file = document.querySelector("#report-file").files?.[0];
  if (!file) return showReportError("Choose a FIRMA JSON report first.");
  if (file.size > MAX_REPORT_BYTES) return showReportError("The report is larger than 256 KiB.");
  setReportLoading(true);
  try {
    const text = await file.text();
    if (new TextEncoder().encode(text).byteLength > MAX_REPORT_BYTES) throw new Error("The report is larger than 256 KiB.");
    const response = await fetch("/api/check-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reportText: text,
        expectedCommitment: document.querySelector("#expected-commitment").value.trim() || null,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    renderIndependent(body);
  } catch (error) {
    showReportError(error instanceof Error ? error.message : "The report could not be checked.");
  } finally {
    setReportLoading(false);
  }
});

copyButton.addEventListener("click", async () => {
  if (!latestReport) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(latestReport, null, 2));
    copyButton.textContent = "Copied";
  } catch {
    copyButton.textContent = "Copy failed";
  }
  setTimeout(() => { copyButton.textContent = "Copy JSON"; }, 1500);
});

document.querySelector("#download-button").addEventListener("click", () => {
  if (!latestReport) return;
  downloadJson(latestReport, evidenceFilename(latestReport));
});

document.querySelector("#anchor-button").addEventListener("click", () => {
  const panel = document.querySelector("#anchor-panel");
  panel.hidden = false;
  document.querySelector("#anchor-title").scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#connect-subwallet-button").focus({ preventScroll: true });
});

document.querySelector("#connect-subwallet-button").addEventListener("click", async () => {
  const button = document.querySelector("#connect-subwallet-button");
  const select = document.querySelector("#native-account");
  document.querySelector("#anchor-error").hidden = true;
  button.disabled = true;
  try {
    nativeSession = await connectSubWallet();
    select.replaceChildren(...nativeSession.accounts.map((account) => {
      const option = document.createElement("option");
      option.value = account.address;
      option.textContent = `${account.name} — ${account.address}`;
      return option;
    }));
    select.disabled = false;
    document.querySelector("#estimate-native-button").disabled = false;
    document.querySelector("#native-wallet-state").textContent = `${nativeSession.accounts.length} native SubWallet account${nativeSession.accounts.length === 1 ? "" : "s"} available. Select the exact signer.`;
  } catch (error) {
    nativeSession = null;
    showAnchorError(error instanceof Error ? error.message : "SubWallet could not connect.");
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#estimate-native-button").addEventListener("click", async () => {
  const button = document.querySelector("#estimate-native-button");
  const walletState = document.querySelector("#native-wallet-state");
  const selected = document.querySelector("#native-account").value;
  document.querySelector("#anchor-error").hidden = true;
  document.querySelector("#native-confirmation").hidden = true;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "Verifying network…";
  walletState.textContent = "Connecting to Portaldot, checking the reviewed runtime, and estimating this account's fee. Connection attempts are bounded.";
  try {
    if (!latestReport || !nativeSession) throw new Error("Generate a report and connect SubWallet before estimating.");
    if (nativeInspection) await closeNativeInspection(nativeInspection);
    const reportText = JSON.stringify(latestReport);
    const preparation = await postOnchainProof({ action: "prepare-native", reportText, account: selected });
    nativeInspection = await inspectNativeAnchor(nativeSession, preparation, selected);
    if (JSON.stringify(latestReport) !== reportText) throw new Error("The report changed during preparation. Generate a fresh report.");
    anchorReportText = reportText;
    anchorTransactionHash = null;
    nativeSidecar = null;
    latestAnchorEvidence = null;
    document.querySelector("#native-chain").textContent = `PortaldotV3 Test (${nativeInspection.identity.genesisHash})`;
    document.querySelector("#native-account-confirm").textContent = nativeInspection.signer;
    document.querySelector("#native-destination").textContent = "system.remarkWithEvent";
    document.querySelector("#native-commitment").textContent = preparation.commitment;
    document.querySelector("#native-payload").textContent = preparation.payload;
    document.querySelector("#native-value").textContent = "0 tPOT";
    document.querySelector("#native-fee").textContent = `${formatTPotBaseUnits(nativeInspection.maximumFeeBaseUnits)} (${nativeInspection.maximumFeeBaseUnits} base units)`;
    document.querySelector("#native-confirmation").hidden = false;
    document.querySelector("#native-consent").checked = false;
    document.querySelector("#submit-native-button").disabled = true;
    walletState.textContent = "Network identity, runtime, account, call, zero value, payload, and account-specific fee verified. Review every field below.";
  } catch (error) {
    nativeInspection = null;
    walletState.textContent = "Network and fee verification stopped. Review the error below; no transaction was submitted.";
    showAnchorError(error instanceof Error ? error.message : "The native transaction could not be estimated.");
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = "Verify network & estimate fee";
  }
});

document.querySelector("#native-consent").addEventListener("change", (event) => {
  document.querySelector("#submit-native-button").disabled = !event.currentTarget.checked || !nativeInspection;
});

document.querySelector("#submit-native-button").addEventListener("click", async () => {
  const button = document.querySelector("#submit-native-button");
  if (!nativeInspection || !document.querySelector("#native-consent").checked) return showAnchorError("Review and confirm the exact native wallet request before signing.");
  button.disabled = true;
  document.querySelector("#anchor-error").hidden = true;
  document.querySelector("#anchor-progress").hidden = false;
  try {
    nativeSidecar = await submitNativeAnchor(nativeInspection);
    nativeInspection = null;
    anchorTransactionHash = nativeSidecar.transactionHash;
    document.querySelector("#anchor-transaction-hash").textContent = nativeSidecar.transactionHash;
    document.querySelector("#anchor-result").hidden = false;
    document.querySelector("#anchor-result-summary").textContent = "SubWallet finalized the native transaction. FIRMA is independently checking its block, signer, payload, execution event, and finality.";
    await verifySubmittedAnchor();
  } catch (error) {
    nativeInspection = null;
    showAnchorError(error instanceof Error ? error.message : "The native wallet request failed.");
  } finally {
    document.querySelector("#anchor-progress").hidden = true;
  }
});

document.querySelector("#connect-wallet-button").addEventListener("click", async () => {
  const connectButton = document.querySelector("#connect-wallet-button");
  const error = document.querySelector("#anchor-error");
  error.hidden = true;
  connectButton.disabled = true;
  connectButton.querySelector(".button-label").textContent = "Inspecting wallet";
  try {
    if (!latestReport) throw new Error("Generate a FIRMA report before anchoring it.");
    const reportText = JSON.stringify(latestReport);
    const account = await connectWallet();
    document.querySelector("#wallet-state").textContent = `Connected EVM account: ${account}`;
    const preparation = await postOnchainProof({ action: "prepare", reportText, account });
    const inspection = await inspectAnchorTransaction(globalThis.ethereum, preparation);
    if (JSON.stringify(latestReport) !== reportText) throw new Error("The report changed during preparation. Generate a fresh report.");
    anchorInspection = inspection;
    anchorReportText = reportText;
    anchorTransactionHash = null;
    latestAnchorEvidence = null;
    document.querySelector("#anchor-chain").textContent = `Portaldot V3 Test (${inspection.chainId})`;
    document.querySelector("#anchor-account").textContent = inspection.account;
    document.querySelector("#anchor-destination").textContent = inspection.transaction.to;
    document.querySelector("#anchor-commitment").textContent = preparation.commitment;
    document.querySelector("#anchor-value").textContent = "0 tPOT (0x0)";
    document.querySelector("#anchor-fee").textContent = `${formatTPotBaseUnits(inspection.maximumFeeBaseUnits)} (${inspection.maximumFeeBaseUnits} base units)`;
    document.querySelector("#anchor-confirmation").hidden = false;
    document.querySelector("#anchor-consent").checked = false;
    document.querySelector("#submit-anchor-button").disabled = true;
  } catch (walletError) {
    anchorInspection = null;
    showAnchorError(walletError instanceof Error ? walletError.message : "The wallet could not be prepared.");
  } finally {
    connectButton.disabled = false;
    connectButton.querySelector(".button-label").textContent = "Connect EVM wallet & estimate";
  }
});

document.querySelector("#anchor-consent").addEventListener("change", (event) => {
  document.querySelector("#submit-anchor-button").disabled = !event.currentTarget.checked || !anchorInspection;
});

document.querySelector("#submit-anchor-button").addEventListener("click", async () => {
  const submitButton = document.querySelector("#submit-anchor-button");
  const consent = document.querySelector("#anchor-consent");
  if (!anchorInspection || !consent.checked) return showAnchorError("Review and confirm the exact wallet request before signing.");
  submitButton.disabled = true;
  document.querySelector("#anchor-error").hidden = true;
  try {
    anchorTransactionHash = await submitAnchorTransaction(globalThis.ethereum, anchorInspection);
    document.querySelector("#anchor-transaction-hash").textContent = anchorTransactionHash;
    document.querySelector("#anchor-result").hidden = false;
    document.querySelector("#anchor-result-summary").textContent = "The wallet returned a transaction hash. FIRMA is checking receipt and finality evidence once.";
    await verifySubmittedAnchor();
  } catch (walletError) {
    showAnchorError(walletError instanceof Error ? walletError.message : "The wallet request failed.");
    submitButton.disabled = false;
  }
});

document.querySelector("#retry-anchor-proof-button").addEventListener("click", verifySubmittedAnchor);
document.querySelector("#download-anchor-button").addEventListener("click", () => {
  if (nativeSidecar) downloadJson(nativeSidecar, anchoringFilename(nativeSidecar));
  else if (latestAnchorEvidence) downloadJson(latestAnchorEvidence, anchoringFilename(latestAnchorEvidence));
});

document.querySelector("#onchain-proof-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector("#onchain-proof-error");
  const progress = document.querySelector("#onchain-proof-progress");
  const button = document.querySelector("#onchain-proof-button");
  error.hidden = true;
  const reportFile = document.querySelector("#onchain-report-file").files?.[0];
  const evidenceFile = document.querySelector("#anchor-evidence-file").files?.[0];
  const transactionHash = document.querySelector("#onchain-transaction-hash").value.trim();
  if (!reportFile) {
    error.textContent = "Choose the original FIRMA report first.";
    error.hidden = false;
    error.focus();
    return;
  }
  if (reportFile.size > MAX_REPORT_BYTES || (evidenceFile && evidenceFile.size > MAX_REPORT_BYTES)) {
    error.textContent = "The selected JSON file is larger than 256 KiB.";
    error.hidden = false;
    return;
  }
  if (Boolean(transactionHash) === Boolean(evidenceFile)) {
    error.textContent = "Provide either one transaction hash or one anchoring evidence file.";
    error.hidden = false;
    return;
  }
  form.setAttribute("aria-busy", "true");
  for (const input of form.querySelectorAll("input, button")) input.disabled = true;
  progress.hidden = false;
  button.querySelector(".button-label").textContent = "Verifying proof";
  try {
    const body = { action: "verify", reportText: await reportFile.text() };
    if (transactionHash) body.transactionHash = transactionHash;
    else body.anchorEvidenceText = await evidenceFile.text();
    const response = await postOnchainProof(body);
    renderOnchainProof(response);
  } catch (proofError) {
    error.textContent = proofError instanceof Error ? proofError.message : "The on-chain proof could not be checked.";
    error.hidden = false;
    error.focus();
  } finally {
    form.setAttribute("aria-busy", "false");
    for (const input of form.querySelectorAll("input, button")) input.disabled = false;
    progress.hidden = true;
    button.querySelector(".button-label").textContent = "Verify on-chain proof";
  }
});
