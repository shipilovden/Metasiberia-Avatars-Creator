import { execFileSync, spawn } from "node:child_process";
import path from "node:path";

const PORT = 5174;

const execText = (command, args) => {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

const getListeningPids = (port) => {
  if (process.platform === "win32") {
    const script = [
      `$pids = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`,
      `if ($pids) { $pids -join [Environment]::NewLine }`,
    ].join("; ");

    return execText("powershell", ["-NoProfile", "-Command", script])
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => Number(line))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  }

  return execText("bash", ["-lc", `lsof -ti tcp:${port} -sTCP:LISTEN || true`])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => Number(line))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
};

const getProcessName = (pid) => {
  if (process.platform === "win32") {
    return execText("powershell", [
      "-NoProfile",
      "-Command",
      `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).ProcessName`,
    ]);
  }

  return execText("bash", ["-lc", `ps -p ${pid} -o comm= || true`]);
};

const stopProcess = (pid) => {
  if (process.platform === "win32") {
    execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      `Stop-Process -Id ${pid} -Force`,
    ]);
    return;
  }

  execFileSync("bash", ["-lc", `kill -9 ${pid}`]);
};

const freePort = (port) => {
  const pids = getListeningPids(port);
  if (pids.length === 0) {
    return;
  }

  for (const pid of pids) {
    const name = getProcessName(pid).toLowerCase();
    if (!name.includes("node")) {
      console.error(
        `[dev] port ${port} is occupied by pid ${pid} (${name || "unknown process"}).`
      );
      console.error("[dev] automatic shutdown is allowed only for node processes.");
      process.exit(1);
    }
  }

  for (const pid of pids) {
    console.log(`[dev] stopping stale node process on port ${port}: pid ${pid}`);
    stopProcess(pid);
  }
};

const startVite = () => {
  const viteEntry = path.resolve("node_modules", "vite", "bin", "vite.js");
  const child = spawn(
    process.execPath,
    [viteEntry, "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    }
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
};

freePort(PORT);
startVite();
