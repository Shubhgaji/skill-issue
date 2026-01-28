# 🔍 skill-issue

A Clawdbot skill that audits and reviews all your installed skills.

**Find the skill issues before they find you.**

> **Name credit:** [Josh Puckett](https://x.com/joshpuckett) — who immediately knew it had to be called `/skill-issue`
>
> **Concept credit:** [Benji Taylor](https://x.com/benjitaylor) — "I need a skill that reviews all the other skills, figures out which ones are performing, and fires the rest. HR department for skills."

## What It Does

- **Inventories** every installed skill (system + workspace)
- **Tracks usage** by scanning recent memory files and session logs
- **Checks versions** against ClawdHub registry
- **Verifies health** — required binaries and environment variables
- **Recommends action** — keep, update, review, or remove

## Install

```bash
# Via ClawdHub
clawdhub install skill-issue

# Or manually
cp -r skill-issue/ ~/clawd/skills/skill-issue/
```

## Usage

### On-Demand
Ask your agent:
> "Run a skill audit" / "Check my skills for issues" / "Which skills need updates?"

### CLI
```bash
bash ~/clawd/skills/skill-issue/scripts/audit.sh
```

### Cron
Schedule a weekly audit via Clawdbot cron:
```
Run skill audit: bash ~/clawd/skills/skill-issue/scripts/audit.sh > ~/clawd/memory/skill-audit-latest.md
```

## Sample Output

```
# 🔍 Skill Audit Report

## Summary
- Total skills: 52
- ✅ Keep: 12
- 🔎 Review: 38
- 🗑️ Remove: 2

## Detailed Report
| # | Skill       | Source   | Bins    | Usage (7d) | Health | Hub    | Rec       |
|---|-------------|----------|---------|------------|--------|--------|-----------|
| 1 | 🌤️ weather  | system   | curl    | 📊 5       | ✅     | v1.0.0 | ✅ keep   |
| 2 | 🗣️ sag      | system   | sag     | —          | ⚠️ env | —      | 🔎 review |
| 3 | 📧 himalaya | system   | himalaya| 📊 8       | ✅     | v0.9.0 | ✅ keep   |
```

## Requirements

- Bash 4+ (macOS ships with bash 3 — uses `/usr/bin/env bash`)
- Python 3 (for JSON metadata parsing)
- `clawdhub` CLI (optional, for version checks)

## License

MIT — see [LICENSE](LICENSE)
