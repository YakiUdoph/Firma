import { LABEL, VERDICT_COPY, evidenceFilename, reportContext } from "/view-model.js";
import { assessReportIntegrity, guidanceForCheck, projectInvestigation } from "/investigation.js";

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
  document.querySelector("#independent-json").textContent = JSON.stringify(response, null, 2);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  title.tabIndex = -1;
  title.focus({ preventScroll: true });
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
  const blob = new Blob([`${JSON.stringify(latestReport, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = evidenceFilename(latestReport);
  link.click();
  URL.revokeObjectURL(link.href);
});
