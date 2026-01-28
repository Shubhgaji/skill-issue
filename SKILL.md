---
name: skill-issue
description: "Audit and review all installed Clawdbot skills. Run on-demand or via cron to get a health report: skill inventory, usage tracking, version checks against ClawdHub, dependency health, and actionable recommendations (keep, update, review, remove). Use when asked to review skills, check for skill updates, find unused skills, or audit the skill ecosystem."
---

# Skill Issue — Skill Auditor

Audit all installed Clawdbot skills and produce a markdown report with recommendations.

## Quick Start

Run the audit script:
```bash
bash ~/clawd/skills/skill-issue/scripts/audit.sh
```

The script outputs a markdown report to stdout. To save:
```bash
bash ~/clawd/skills/skill-issue/scripts/audit.sh > /tmp/skill-audit-report.md
```

## What It Checks

1. **Inventory** — Lists every installed skill (system + workspace) with name, description, emoji, and required binaries
2. **Usage** — Scans recent memory files and session logs for skill name mentions to gauge activity
3. **Version** — Compares installed skills against ClawdHub registry (requires `clawdhub` CLI)
4. **Health** — Verifies required binaries (`requires.bins`) and env vars (`requires.env`) are available
5. **Recommendations** — Categorizes each skill:
   - **keep** — Active and healthy
   - **update** — Outdated (newer version on ClawdHub)
   - **review** — Unused (no recent mentions in memory/logs)
   - **remove** — Broken (missing required dependencies)

## Output Format

Clean markdown tables suitable for chat or GitHub README. Example:

```
| Skill | Status | Version | Health | Recommendation |
|-------|--------|---------|--------|----------------|
| weather | active | 1.0.0 ✓ | ✅ healthy | keep |
| sag | unused | 1.0.0 ✓ | ⚠️ missing env | review |
```

## Cron Usage

Schedule via Clawdbot cron to run weekly:
```
Run skill audit: bash ~/clawd/skills/skill-issue/scripts/audit.sh > ~/clawd/memory/skill-audit-latest.md
```

## Safety

- **Read-only** — The audit script only reads SKILL.md files, checks `which` for binaries, and queries ClawdHub. It never modifies, installs, or removes anything.
- **No destructive actions** — Recommendations are advisory only. Always confirm before acting on remove/update suggestions.

## Manual Actions (after reviewing the report)

Update a skill:
```bash
clawdhub update <skill-name>
```

Update all outdated skills:
```bash
clawdhub update --all
```

Remove a skill (requires confirmation):
```bash
rm -ri /opt/homebrew/lib/node_modules/clawdbot/skills/<skill-name>
```
