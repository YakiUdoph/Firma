export const VERIFICATION_DIAGNOSTIC_STAGES = Object.freeze([
  "substrate.connection",
  "substrate.finalized_head",
  "substrate.runtime_metadata",
  "substrate.historical_decoration",
  "substrate.runtime_fingerprint",
  "substrate.native_storage",
  "evm.identity",
  "evm.block",
  "evm.contract_reads",
]);

const STAGES = new Set(VERIFICATION_DIAGNOSTIC_STAGES);
const OUTCOMES = new Set(["ok", "error", "unavailable", "partial", "not_reached"]);

function durationMs(startedAt, completedAt) {
  return Math.max(0, Math.round(completedAt - startedAt));
}

export function classifyDiagnosticError(error) {
  const name = typeof error?.name === "string" ? error.name : "";
  const message = typeof error?.message === "string" ? error.message : "";
  if (/timeout/i.test(name)) return "timeout";
  if (/abort/i.test(name)) return "cancelled";
  if (/rpc/i.test(name)) return "rpc_error";
  if (/historical(state|finality)unavailable/i.test(name)) return "historical_unavailable";
  if (/syntax/i.test(name)) return "malformed_response";
  if (/input/i.test(name)) return "input_error";
  if (/HTTP\s+\d{3}/i.test(message)) return "http_error";
  if (/type/i.test(name)) return "transport_error";
  return "internal_error";
}

function safeRequestId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(value) ? value : "invalid-request-id";
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function defaultLogger(entry) {
  console.info(JSON.stringify(entry));
}

export function createVerificationDiagnostics({ requestId, logger = defaultLogger, now = () => performance.now() } = {}) {
  const verificationStartedAt = now();
  const stages = Object.fromEntries(VERIFICATION_DIAGNOSTIC_STAGES.map((name) => [name, { durationMs: null, outcome: "not_reached" }]));
  let active = null;
  let emitted = false;
  let failure = null;
  const retries = {};

  function closeActive(outcome, category = null) {
    if (!active) return;
    const normalizedOutcome = OUTCOMES.has(outcome) ? outcome : "error";
    stages[active.name] = {
      durationMs: durationMs(active.startedAt, now()),
      outcome: normalizedOutcome,
      ...(category ? { category } : {}),
    };
    if (normalizedOutcome === "error" && !failure) failure = { stage: active.name, category: category ?? "internal_error" };
    active = null;
  }

  function recordFailure(error) {
    const category = classifyDiagnosticError(error);
    if (active) closeActive("error", category);
    else if (!failure) failure = { stage: "verification", category };
  }

  return Object.freeze({
    start(stage) {
      if (emitted || !STAGES.has(stage)) return;
      if (active) closeActive("error", "instrumentation_error");
      active = { name: stage, startedAt: now() };
    },
    end(outcome = "ok", category = null) {
      if (emitted) return;
      closeActive(outcome, category);
    },
    fail(error) {
      if (emitted) return;
      recordFailure(error);
    },
    retry(stage) {
      if (emitted || !STAGES.has(stage)) return;
      retries[stage] = (retries[stage] ?? 0) + 1;
    },
    emit(verdict = null, error = null) {
      if (emitted) return;
      if (error) recordFailure(error);
      else if (active) closeActive("error", "incomplete_stage");
      emitted = true;
      const entry = {
        event: "firma.verification.timing.v1",
        requestId: safeRequestId(requestId),
        totalDurationMs: durationMs(verificationStartedAt, now()),
        stages,
        counts: {
          PASS: safeCount(verdict?.counts?.PASS),
          FAIL: safeCount(verdict?.counts?.FAIL),
          UNKNOWN: safeCount(verdict?.counts?.UNKNOWN),
        },
        failure,
        ...(Object.keys(retries).length ? { retries } : {}),
      };
      try {
        logger(entry);
      } catch {
        // Diagnostics are deliberately fail-open and cannot change verification behavior.
      }
    },
  });
}
