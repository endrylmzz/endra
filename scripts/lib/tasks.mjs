// Minimal, purpose-built parser for docs/TASKS.yaml.
// This is NOT a general YAML parser - it only understands the flat
// "project / current_phase / tasks[] with scalar keys + depends_on list"
// shape used in that one file. If the schema grows beyond this, switch to
// a real YAML library instead of extending this parser.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TASKS_PATH = path.join(__dirname, "..", "..", "docs", "TASKS.yaml");

export function parseTasksYaml(text) {
  const lines = text.split(/\r?\n/);
  const tasks = [];
  let project = null;
  let currentPhase = null;
  let current = null;
  let listKey = null;

  const pushCurrent = () => {
    if (current) tasks.push(current);
    current = null;
    listKey = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const taskStart = /^\s*-\s*id:\s*(\S+)\s*$/.exec(line);
    if (taskStart) {
      pushCurrent();
      current = { id: taskStart[1], depends_on: [] };
      continue;
    }

    if (!current) {
      const top = /^([a-zA-Z_]+):\s*(.*)$/.exec(line);
      if (top) {
        if (top[1] === "project") project = top[2].trim();
        if (top[1] === "current_phase") currentPhase = Number(top[2].trim());
      }
      continue;
    }

    const listItem = /^\s*-\s+(\S+)\s*$/.exec(line);
    if (listItem && listKey === "depends_on") {
      current.depends_on.push(listItem[1]);
      continue;
    }

    const kv = /^\s*([a-zA-Z_]+):\s*(.*)$/.exec(line);
    if (kv) {
      const [, key, value] = kv;
      if (key === "depends_on") {
        listKey = "depends_on";
        continue;
      }
      listKey = null;
      current[key] = key === "phase" ? Number(value.trim()) : value.trim();
    }
  }
  pushCurrent();

  return { project, currentPhase, tasks };
}

export function loadTasks() {
  const text = readFileSync(TASKS_PATH, "utf8");
  return parseTasksYaml(text);
}
