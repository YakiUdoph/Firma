import { spawn } from "node:child_process";
import { createServer } from "node:net";

const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;
const MAX_STARTUP_TIMEOUT_MS = 15_000;
const OUTPUT_LIMIT = 16_384;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function appendOutput(current, chunk) {
  const combined = current + chunk;
  return combined.length <= OUTPUT_LIMIT ? combined : combined.slice(-OUTPUT_LIMIT);
}

function diagnostics({ reason, command, args, url, stdout, stderr, terminal, lastFailure }) {
  const exit = terminal
    ? `exit code ${terminal.code ?? "none"}, signal ${terminal.signal ?? "none"}${terminal.error ? `, spawn error ${terminal.error.message}` : ""}`
    : "process still running";
  return [
    `${reason} (${exit}).`,
    `Command: ${[command, ...args].join(" ")}`,
    `URL: ${url}`,
    `Last readiness result: ${lastFailure ?? "none"}`,
    `stdout:\n${stdout.trim() || "(empty)"}`,
    `stderr:\n${stderr.trim() || "(empty)"}`,
  ].join("\n");
}

export function browserStartupTimeout(value = process.env.FIRMA_BROWSER_STARTUP_TIMEOUT_MS) {
  if (value === undefined || value === "") return DEFAULT_STARTUP_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("FIRMA_BROWSER_STARTUP_TIMEOUT_MS must be a positive integer.");
  }
  return Math.min(parsed, MAX_STARTUP_TIMEOUT_MS);
}

export async function reserveLoopbackPort() {
  const reservation = createServer();
  try {
    await new Promise((resolve, reject) => {
      reservation.once("error", reject);
      reservation.listen(0, "127.0.0.1", resolve);
    });
    const address = reservation.address();
    if (!address || typeof address === "string") throw new Error("Could not allocate a loopback test port.");
    return address.port;
  } finally {
    await new Promise((resolve) => reservation.close(() => resolve()));
  }
}

export async function stopChildProcess(child, graceMs = 1_000) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, delay(graceMs)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([exited, delay(graceMs)]);
  }
}

export async function startManagedHttpServer({
  command = process.execPath,
  args,
  cwd,
  env = {},
  timeoutMs = browserStartupTimeout(),
  pollIntervalMs = 100,
}) {
  const port = await reserveLoopbackPort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let terminal = null;
  let lastFailure = null;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout = appendOutput(stdout, chunk); });
  child.stderr.on("data", (chunk) => { stderr = appendOutput(stderr, chunk); });
  child.once("error", (error) => { terminal = { error }; });
  child.once("exit", (code, signal) => { terminal = { code, signal }; });

  const deadline = Date.now() + Math.min(timeoutMs, MAX_STARTUP_TIMEOUT_MS);
  try {
    while (Date.now() < deadline) {
      if (terminal) {
        throw new Error(diagnostics({ reason: "Server exited before it became ready", command, args, url, stdout, stderr, terminal, lastFailure }));
      }
      const remaining = deadline - Date.now();
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(1, Math.min(500, remaining))) });
        if (response.ok) {
          return { child, port, url, stop: () => stopChildProcess(child) };
        }
        lastFailure = `HTTP ${response.status}`;
      } catch (error) {
        lastFailure = error?.cause?.message ?? error?.message ?? String(error);
      }
      await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())));
    }
    throw new Error(diagnostics({ reason: `Server did not become ready within ${Math.min(timeoutMs, MAX_STARTUP_TIMEOUT_MS)}ms`, command, args, url, stdout, stderr, terminal, lastFailure }));
  } catch (error) {
    await stopChildProcess(child);
    throw error;
  }
}
