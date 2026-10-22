import { LABEL, VERDICT_COPY, evidenceFilename, reportContext } from "/view-model.js";

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
const evidenceJson = document.querySelector("#evidence-json");
const copyButton = document.querySelector("#copy-button");
let latestReport = null;

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
  number.textContent = String(count ?? 0);
  const label = document.createElement("span");
  label.textContent = LABEL[status];
  const code = document.createElement("small");
  code.textContent = status;
  item.append(number, label, code);
  return item;
}

function evidenceDetails(evidence) {
  const details = document.createElement("details");
  details.className = "check-evidence";
  const summary = document.createElement("summary");
  summary.textContent = "View check evidence";
  const pre = document.createElement("pre");
  pre.tabIndex = 0;
  pre.textContent = JSON.stringify(evidence ?? {}, null, 2);
  details.append(summary, pre);
  return details;
}

function checkRow(item, index) {
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
  const humanStatus = document.createTextNode(LABEL[item.status]);
  const statusCode = document.createElement("small");
  statusCode.textContent = item.status;
  badge.append(marker, humanStatus, statusCode);
  heading.append(title, badge);
  const summary = document.createElement("p");
  summary.textContent = item.summary;
  body.append(heading, summary, evidenceDetails(item.evidence));
  row.append(indexLabel, body);
  return row;
}

function setLoading(loading) {
  form.setAttribute("aria-busy", String(loading));
  progress.hidden = !loading;
  button.disabled = loading;
  for (const input of form.querySelectorAll("input")) input.disabled = loading;
  buttonLabel.textContent = loading ? "Verifying asset" : "Verify asset";
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
  const status = report.verdict.overall;
  result.hidden = false;
  result.dataset.status = status;
  verdictTitle.textContent = LABEL[status];
  verdictSymbol.textContent = status === "PASS" ? "\u2713" : status === "FAIL" ? "\u00d7" : "?";
  verdictSummary.textContent = VERDICT_COPY[status];
  verdictCounts.replaceChildren(...["PASS", "FAIL", "UNKNOWN"].map((item) => countItem(item, report.verdict.counts?.[item])));
  context.replaceChildren(...reportContext(report).map(contextItem));
  checks.replaceChildren(...report.verdict.checks.map(checkRow));
  evidenceJson.textContent = JSON.stringify(report, null, 2);
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
