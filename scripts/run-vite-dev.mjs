import { spawn } from "node:child_process";

const host = process.env.VANA_ANDROID_DEV === "1" ? "0.0.0.0" : "127.0.0.1";
const args = ["vite", "--host", host, "--port", process.env.PORT || "3000", "--strictPort"];

const child = spawn("npx", args, {
  stdio: "inherit",
  shell: false,
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
