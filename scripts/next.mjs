#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadTasks } from "./lib/tasks.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const { tasks } = loadTasks();
const current = tasks.find((t) => t.status === "in_progress");
const next = tasks.find((t) => t.status === "pending");

console.log("ENDRA — Next Action\n");
if (current) {
  console.log(`Active task: ${current.id} — ${current.title} (phase ${current.phase})`);
} else if (next) {
  console.log(
    `No task in_progress. Suggested next: ${next.id} — ${next.title} (phase ${next.phase})`,
  );
} else {
  console.log("No pending or in_progress tasks found.");
}
console.log("");

const nextActionPath = path.join(root, "docs", "NEXT_ACTION.md");
if (existsSync(nextActionPath)) {
  console.log(readFileSync(nextActionPath, "utf8").trim());
} else {
  console.log("docs/NEXT_ACTION.md not found.");
}
