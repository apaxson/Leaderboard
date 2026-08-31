// Loads .env.local into the environment *before* Next.js boots, then runs the
// requested Next command. This exists only so PORT (and anything else that must
// be set before the HTTP server starts) can live in .env.local -- Next can't
// read PORT from .env itself because the server binds before any app code runs.
//
// We spawn `next` as a child rather than passing `--env-file` to this process:
// `next dev` copies its own execArgv into the worker's NODE_OPTIONS, and
// `--env-file*` is rejected there.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const [command, ...rest] = process.argv.slice(2);
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", command, ...rest],
  { stdio: "inherit" }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
