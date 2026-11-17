# local-mods

Private Claude Code mods marketplace.

## control-tower
Band above the prompt (context + 5h usage bars, Wrap up button), subagent model routing
(advisor→Fable, executor→Sonnet, scribe→Haiku) and context/5h warning toasts.

Expects on the target machine: `advisor`, `executor`, `scribe` agents in `~/.claude/agents/`
and a `wrap-up` skill in `~/.claude/skills/` (the button runs `/wrap-up`).

## Install on another computer
    claude plugin marketplace add Silver-Satyr/claude-mods
    claude plugin install control-tower@local-mods
Restart Claude Code.

## Update
Bump `version` in `control-tower/.claude-plugin/plugin.json`, push, then on each machine:
    claude plugin marketplace update local-mods && claude plugin update control-tower@local-mods
