const form = document.querySelector("#verify-form");
const button = document.querySelector("#run-button");
const errorBox = document.querySelector("#form-error");
const result = document.querySelector("#result");
const checks = document.querySelector("#checks");
const context = document.querySelector("#context");
const verdictTitle = document.querySelector("#verdict-title");
const verdictSummary = document.querySelector("#verdict-summary");
const evidenceJson = document.querySelector("#evidence-json");
let latestReport = null;

const LABEL = { PASS: "Passed", FAIL: "Failed", UNKNOWN: "Couldn't verify" };

function contextItem(label, value, title = value) {
  const wrapper = document.createElement("div");
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = value ?? "Unavailable";
  detail.title = title ?? "Unavailable";
  wrapper.append(term, detail);
  return wrapper;
}

function render(report) {
  latestReport = report;
  const status = report.verdict.overall;
  result.hidden = false;
  result.dataset.status = status;
  verdictTitle.textContent = LABEL[status];
  verdictSummary.textContent = status === "PASS"
    ? "Every required invariant was proven from one shared block context."
    : status === "FAIL" ? "At least one cross-surface mismatch was proven by the collected evidence."
      : "The evidence is incomplete. FIRMA did not turn an unavailable check into a failure.";
  const substrate = report.evidence.substrate;
  const evm = report.evidence.evm;
  context.replaceChildren(
    contextItem("Finalized block", substrate.finalized?.number),
    contextItem("Runtime", substrate.runtime ? `${substrate.runtime.specName}/${substrate.runtime.specVersion}` : null),
    contextItem("EVM chain ID", evm.identity?.chainId),
    contextItem("Evidence time", new Date(report.completedAt).toLocaleString(), report.completedAt),
  );
  checks.replaceChildren(...report.verdict.checks.map((item) => {
    const row = document.createElement("article");
    row.className = "check";
    row.dataset.status = item.status;
    const badge = document.createElement("div");
    badge.className = "badge";
    const statusLabel = document.createElement("span");
    statusLabel.textContent = LABEL[item.status];
    const statusCode = document.createElement("span");
    statusCode.className = "status-code";
    statusCode.textContent = item.status;
    badge.append(statusLabel, statusCode);
    const body = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = item.title;
    const summary = document.createElement("p");
    summary.textContent = item.summary;
    body.append(title, summary);
    row.append(badge, body);
    return row;
  }));
  evidenceJson.textContent = JSON.stringify(report, null, 2);
  result.scrollIntoView({ behavior: "smooth", block: "start" });
  verdictTitle.setAttribute("tabindex", "-1");
  verdictTitle.focus({ preventScroll: true });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  button.disabled = true;
  form.setAttribute("aria-busy", "true");
  button.firstElementChild.textContent = "Reading finalized state…";
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
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    button.disabled = false;
    form.removeAttribute("aria-busy");
    button.firstElementChild.textContent = "Run read-only verification";
  }
});

document.querySelector("#copy-button").addEventListener("click", async (event) => {
  if (!latestReport) return;
  await navigator.clipboard.writeText(JSON.stringify(latestReport, null, 2));
  event.currentTarget.textContent = "Copied";
  setTimeout(() => { event.currentTarget.textContent = "Copy JSON"; }, 1500);
});

document.querySelector("#download-button").addEventListener("click", () => {
  if (!latestReport) return;
  const blob = new Blob([`${JSON.stringify(latestReport, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `firma-${latestReport.input.assetId}-${latestReport.completedAt.replaceAll(":", "-")}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

