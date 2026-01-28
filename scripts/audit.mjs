#!/usr/bin/env node
/**
 * skill-issue audit — read-only skill auditor for Clawdbot
 * Scans installed skills, checks usage, health, hub versions, and produces a markdown report.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";

// --- Configuration ---
const SYSTEM_SKILLS_DIR = "/opt/homebrew/lib/node_modules/clawdbot/skills";
const WORKSPACE_SKILLS_DIR = join(homedir(), "clawd", "skills");
const MEMORY_DIR = join(homedir(), "clawd", "memory");
const DAYS_BACK = parseInt(process.env.AUDIT_DAYS || "7", 10);

// --- Helpers ---

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const yaml = match[1];
  const result = {};
  for (const line of yaml.split("\n")) {
    const m = line.match(/^(\w[\w-]*):\s*(.+)/);
    if (m) {
      let val = m[2].trim();
      // Strip quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[m[1]] = val;
    }
  }
  // Parse metadata JSON if present
  if (result.metadata) {
    try { result._meta = JSON.parse(result.metadata); } catch { result._meta = {}; }
  }
  return result;
}

function getNestedField(obj, path) {
  const keys = path.split(".");
  let val = obj;
  for (const k of keys) {
    if (!val || typeof val !== "object") return undefined;
    val = val[k];
  }
  return val;
}

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function envExists(name) {
  return !!process.env[name];
}

async function getSkillsFromDir(dir) {
  const skills = [];
  if (!(await exists(dir))) return skills;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(dir, entry.name, "SKILL.md");
    if (await exists(skillFile)) {
      const content = await readFile(skillFile, "utf-8");
      const fm = parseFrontmatter(content);
      skills.push({
        dirName: entry.name,
        name: fm.name || entry.name,
        description: fm.description || "",
        meta: fm._meta || {},
        path: skillFile,
      });
    }
  }
  return skills;
}

async function checkUsage(skillName) {
  let count = 0;
  if (!(await exists(MEMORY_DIR))) return count;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS_BACK);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const files = await readdir(MEMORY_DIR);
  const pattern = new RegExp(skillName.replace(/-/g, "[\\s-]"), "gi");

  for (const f of files) {
    // Check dated memory files within range
    const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (dateMatch) {
      if (dateMatch[1] >= cutoffStr) {
        const content = await readFile(join(MEMORY_DIR, f), "utf-8");
        const matches = content.match(pattern);
        if (matches) count += matches.length;
      }
      continue;
    }
    // Check actions.log and other .log files
    if (f.endsWith(".log") || f.endsWith(".md")) {
      const fp = join(MEMORY_DIR, f);
      const s = await stat(fp);
      // Only check if modified within window
      if (s.mtime >= cutoff) {
        const content = await readFile(fp, "utf-8");
        const matches = content.match(pattern);
        if (matches) count += matches.length;
      }
    }
  }
  return count;
}

function checkHealth(meta) {
  const requires = getNestedField(meta, "clawdbot.requires") || {};
  const bins = requires.bins || [];
  const envs = requires.env || [];

  const missingBins = bins.filter((b) => !commandExists(b));
  const missingEnvs = envs.filter((e) => !envExists(e));

  return { missingBins, missingEnvs, bins, envs };
}

async function checkHubVersion(skillName) {
  if (!commandExists("clawdhub")) return { available: false, version: "n/a" };
  try {
    const output = execSync(`clawdhub search "${skillName}"`, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15000,
    }).toString();
    // Parse lines like: "skill-name v1.0.0  Display Name  (0.448)"
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      // Exact match on skill name (first word)
      const parts = trimmed.split(/\s+/);
      if (parts[0] && parts[0].toLowerCase() === skillName.toLowerCase()) {
        const ver = parts[1]?.replace(/^v/, "") || "unknown";
        return { available: true, version: ver };
      }
    }
    return { available: true, version: "not found" };
  } catch {
    return { available: true, version: "error" };
  }
}

// --- Main ---
async function main() {
  const now = new Date();
  const timestamp = now.toISOString().replace("T", " ").slice(0, 19);

  // Collect skills
  const systemSkills = await getSkillsFromDir(SYSTEM_SKILLS_DIR);
  const workspaceSkills = await getSkillsFromDir(WORKSPACE_SKILLS_DIR);

  // Merge (workspace overrides system)
  const skillMap = new Map();
  for (const s of systemSkills) {
    skillMap.set(s.dirName, { ...s, source: "system" });
  }
  for (const s of workspaceSkills) {
    skillMap.set(s.dirName, { ...s, source: "workspace" });
  }

  const allSkills = [...skillMap.values()].sort((a, b) => a.dirName.localeCompare(b.dirName));
  const hubAvailable = commandExists("clawdhub");

  // Process each skill
  const results = [];
  for (const skill of allSkills) {
    const emoji = getNestedField(skill.meta, "clawdbot.emoji") || "";
    const health = checkHealth(skill.meta);
    const usage = await checkUsage(skill.dirName);
    const hub = await checkHubVersion(skill.dirName);
    const bins = (getNestedField(skill.meta, "clawdbot.requires.bins") || []).join(", ") || "—";

    // Determine recommendation
    let rec;
    if (health.missingBins.length > 0) {
      rec = "remove";
    } else if (hub.version !== "not found" && hub.version !== "n/a" && hub.version !== "error") {
      // Skill exists on hub
      rec = usage > 0 ? "keep" : "review";
    } else if (usage > 0) {
      rec = "keep";
    } else if (health.missingEnvs.length > 0) {
      rec = "review";
    } else {
      rec = "review";
    }

    results.push({ skill, emoji, health, usage, hub, bins, rec });
  }

  // Tally
  const tally = { keep: 0, update: 0, review: 0, remove: 0 };
  for (const r of results) tally[r.rec]++;

  // --- Output ---
  const lines = [];
  const p = (s) => lines.push(s);

  p("# 🔍 Skill Audit Report");
  p("");
  p(`_Generated: ${timestamp}_`);
  p(`_Usage window: last ${DAYS_BACK} days_`);
  p("");
  p("## Summary");
  p("");
  p(`- **Total skills:** ${allSkills.length}`);
  p(`- **ClawdHub:** ${hubAvailable ? "available ✅" : "not installed ⚠️ (version checks skipped)"}`);
  p(`- ✅ **Keep:** ${tally.keep}`);
  p(`- 🔄 **Update:** ${tally.update}`);
  p(`- 🔎 **Review:** ${tally.review}`);
  p(`- 🗑️ **Remove:** ${tally.remove}`);
  p("");

  // Detailed table
  p("## Detailed Report");
  p("");
  p(`| # | Skill | Source | Bins | Usage (${DAYS_BACK}d) | Health | Hub | Rec |`);
  p("|---|-------|--------|------|---------|--------|-----|-----|");

  results.forEach((r, i) => {
    const { skill, emoji, health, usage, hub, bins, rec } = r;

    // Format health
    let healthFmt;
    if (health.missingBins.length > 0) {
      healthFmt = `❌ ${health.missingBins.join(", ")}`;
    } else if (health.missingEnvs.length > 0) {
      healthFmt = `⚠️ env: ${health.missingEnvs.join(", ")}`;
    } else {
      healthFmt = "✅";
    }

    // Format recommendation
    const recMap = { keep: "✅ keep", update: "🔄 update", review: "🔎 review", remove: "🗑️ remove" };
    const recFmt = recMap[rec] || rec;

    // Format hub
    let hubFmt;
    if (hub.version === "not found") hubFmt = "—";
    else if (hub.version === "n/a") hubFmt = "n/a";
    else if (hub.version === "error") hubFmt = "err";
    else hubFmt = `v${hub.version}`;

    // Format usage
    const usageFmt = usage > 0 ? `📊 ${usage}` : "—";

    const name = emoji ? `${emoji} ${skill.dirName}` : skill.dirName;
    p(`| ${i + 1} | ${name} | ${skill.source} | ${bins} | ${usageFmt} | ${healthFmt} | ${hubFmt} | ${recFmt} |`);
  });

  p("");

  // Attention section
  p("## ⚠️ Skills Needing Attention");
  p("");

  const broken = results.filter((r) => r.rec === "remove");
  const envIssues = results.filter((r) => r.health.missingEnvs.length > 0 && r.rec !== "remove");

  if (broken.length === 0 && envIssues.length === 0) {
    p("_No critical issues found._");
  } else {
    for (const r of broken) {
      p(`- **${r.skill.dirName}** — 🗑️ Broken: \`${r.health.missingBins.join(", ")}\` not found. Install deps or remove skill.`);
    }
    for (const r of envIssues) {
      p(`- **${r.skill.dirName}** — ⚠️ Missing env: \`${r.health.missingEnvs.join(", ")}\`. Set env vars or review if needed.`);
    }
  }

  p("");
  p("---");
  p("_Audit complete. This report is read-only — no changes were made._");

  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error("Audit failed:", err.message);
  process.exit(1);
});
