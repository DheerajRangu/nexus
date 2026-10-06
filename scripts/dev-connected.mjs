import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
process.env.YOLO_CONFIG_DIR ||= resolve('.tools/ultralytics');
mkdirSync(resolve(process.env.YOLO_CONFIG_DIR, 'Ultralytics'), { recursive: true });
const children = [];
let stopping = false;
function start(command, args, env = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
  return child;
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
const backend = process.env.AEGIS_API_ORIGIN || "http://127.0.0.1:8000";
let online = false;
try {
  const response = await fetch(backend + "/api/health", {
    signal: AbortSignal.timeout(1500),
  });
  online = response.ok;
} catch {}
if (!online) {
  if (process.env.AEGIS_API_ORIGIN) {
    console.error("Configured API is unavailable:", backend);
    process.exit(1);
  }
  const python =
    process.platform === "win32"
      ? ".venv/Scripts/python.exe"
      : ".venv/bin/python";
  if (!existsSync(python)) {
    console.error(
      "Create .venv and install requirements.txt first. See docs/SETUP.md.",
    );
    process.exit(1);
  }
  start(python, [
    "-m",
    "uvicorn",
    "backend.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    "8000",
  ]);
  for (let attempt = 0; attempt < 80 && !online; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      online = (
        await fetch(backend + "/api/health", {
          signal: AbortSignal.timeout(1000),
        })
      ).ok;
    } catch {}
  }
  if (!online) {
    console.error("Shared API did not start. Check the backend logs.");
    stop(1);
  }
}
if (online && !stopping) {
  console.log("AEGIS shared API connected:", backend);
  start(process.platform === "win32" ? "node.exe" : "node", [
    "node_modules/vite/bin/vite.js",
    "--config",
    "frontend/vite.config.ts",
    "frontend",
    "--host",
    "0.0.0.0",
    ...process.argv.slice(2),
  ]);
}
