import { spawn } from "node:child_process";
const children = [
  spawn(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "watch", "apps/api/src/index.ts"],
    { stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "apps/web",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3100",
    ],
    { stdio: "inherit" },
  ),
];
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children)
  child.on("exit", (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
