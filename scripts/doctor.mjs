#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadTasks } from "./lib/tasks.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const results = [];
const check = (label, fn) => {
  try {
    const ok = fn();
    results.push([label, ok ? "OK" : "FAIL"]);
    return ok;
  } catch {
    results.push([label, "FAIL"]);
    return false;
  }
};

check("Node", () => {
  const major = Number(process.versions.node.split(".")[0]);
  return major >= 20;
});

check("Environment template", () => existsSync(path.join(root, ".env.example")));

check("Supabase config", () => {
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) return true; // not required until Phase 2
  const env = readFileSync(envPath, "utf8");
  const hasUrl = /^SUPABASE_URL=.+/m.test(env);
  const hasKey = /^SUPABASE_SERVICE_ROLE_KEY=.+/m.test(env);
  // Either both set or both unset - a half-configured Supabase is worth flagging.
  return hasUrl === hasKey;
});

check("Workspace build", () => {
  execSync("npm run build --workspaces --if-present", { cwd: root, stdio: "pipe" });
  return true;
});

check("Tests", () => {
  execSync("npx vitest run", { cwd: root, stdio: "pipe" });
  return true;
});

check("Task state", () => {
  const { tasks } = loadTasks();
  const ids = new Set(tasks.map((t) => t.id));
  if (ids.size !== tasks.length) return false;
  for (const t of tasks) {
    for (const dep of t.depends_on ?? []) {
      if (!ids.has(dep)) return false;
    }
    if (t.status === "done") {
      for (const dep of t.depends_on ?? []) {
        const depTask = tasks.find((x) => x.id === dep);
        if (depTask && depTask.status !== "done") return false;
      }
    }
  }
  return true;
});

let gitStatus = "UNKNOWN";
try {
  const out = execSync("git status --porcelain", { cwd: root }).toString();
  gitStatus = out.trim() === "" ? "CLEAN" : "DIRTY";
} catch {
  gitStatus = "NOT A REPO";
}

console.log("ENDRA Doctor\n");
const width = Math.max(...results.map(([label]) => label.length), "Git status".length) + 4;
for (const [label, status] of results) {
  console.log(`${(label + " ").padEnd(width, ".")} ${status}`);
}
console.log(`${("Git status" + " ").padEnd(width, ".")} ${gitStatus}`);

const allOk = results.every(([, status]) => status === "OK");
console.log("");
console.log(allOk ? "System ready." : "Issues found - see above.");
process.exit(allOk ? 0 : 1);
