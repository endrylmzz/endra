#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadTasks } from "./lib/tasks.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const { currentPhase, tasks } = loadTasks();

const counts = { done: 0, in_progress: 0, pending: 0, blocked: 0, skipped: 0 };
for (const t of tasks) {
  counts[t.status] = (counts[t.status] ?? 0) + 1;
}
const countedTotal = counts.done + counts.in_progress + counts.pending + counts.blocked;
const progress = countedTotal > 0 ? Math.round((counts.done / countedTotal) * 100) : 0;

const current = tasks.find((t) => t.status === "in_progress");
const next = tasks.find((t) => t.status === "pending");

const phaseNames = {
  0: "Foundation",
  1: "ENDRA Core",
  2: "Persistent Memory",
  3: "Tool Architecture",
  4: "Telegram",
  5: "Useful Tools",
  6: "Proactive ENDRA",
  7: "Voice",
  8: "Web / PWA",
  9: "Desktop Companion",
};

const statusPath = path.join(root, "docs", "PROJECT_STATUS.md");
let lastUpdated = "unknown";
if (existsSync(statusPath)) {
  const match = readFileSync(statusPath, "utf8").match(/Last Updated:\s*\n?(.+)/);
  if (match) lastUpdated = match[1].trim();
}

console.log("ENDRA\n");
console.log(`Phase ${currentPhase} — ${phaseNames[currentPhase] ?? "Unknown"}\n`);
console.log(`Progress: ${progress}%\n`);
console.log(`Completed: ${counts.done}`);
console.log(`In Progress: ${counts.in_progress}`);
console.log(`Pending: ${counts.pending}`);
console.log(`Blocked: ${counts.blocked}`);
if (counts.skipped) console.log(`Skipped: ${counts.skipped}`);
console.log("");
console.log(`Current:\n${current ? `${current.id} ${current.title}` : "(none)"}\n`);
console.log(`Next:\n${next ? `${next.id} ${next.title}` : "(none)"}\n`);
console.log(`Last update:\n${lastUpdated}`);
