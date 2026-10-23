import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let serverProcess;
let clientProcess;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [clientProcess, serverProcess]) {
    if (child && !child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 250).unref();
}

function startClient(apiPort) {
  const viteCandidates = [
    path.join(root, "node_modules", "vite", "bin", "vite.js"),
    path.join(root, "client", "node_modules", "vite", "bin", "vite.js")
  ];
  const viteEntry = viteCandidates.find((candidate) => fs.existsSync(candidate));
  if (!viteEntry) {
    console.error("Vite was not found. Run npm install from the DayFlow project root, then retry.");
    shutdown(1);
    return;
  }
  clientProcess = spawn(process.execPath, [viteEntry, "--host", "0.0.0.0"], {
    cwd: path.join(root, "client"),
    env: { ...process.env, DAYFLOW_API_PORT: String(apiPort) },
    stdio: "inherit"
  });
  clientProcess.on("exit", (code) => {
    if (!shuttingDown) shutdown(code || 0);
  });
}

serverProcess = spawn(process.execPath, ["server/src/index.js"], {
  cwd: root,
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"]
});

let pending = "";
let clientStarted = false;
serverProcess.stdout.on("data", (chunk) => {
  const value = chunk.toString();
  process.stdout.write(value);
  pending += value;
  const match = pending.match(/DAYFLOW_API_PORT=(\d+)/);
  if (match && !clientStarted) {
    clientStarted = true;
    startClient(Number(match[1]));
  }
  pending = pending.slice(-4000);
});
serverProcess.stderr.on("data", (chunk) => process.stderr.write(chunk));
serverProcess.on("exit", (code) => {
  if (!shuttingDown) shutdown(code || 1);
});
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
