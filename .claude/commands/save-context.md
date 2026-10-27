---
description: Write a summarized handoff of the current session to .claude/context-snapshots/
argument-hint: "[optional focus note, e.g. 'emphasize the API migration']"
allowed-tools: Bash(date:*), Bash(mkdir:*), Write
---

Write a **context handoff** for the current session so work can resume later (or in a fresh session) without re-deriving everything.

Steps:
1. Run `date +%Y%m%d-%H%M%S` to get a timestamp, and `mkdir -p .claude/context-snapshots`.
2. Using everything in THIS conversation, write a markdown file to `.claude/context-snapshots/handoff-<timestamp>.md` with these sections:
   - **Goal** — what the user is ultimately trying to accomplish.
   - **Current state** — what is done and verified so far (be concrete: files, commands, outcomes).
   - **Key decisions** — choices made and the reasoning, so they aren't relitigated.
   - **Files touched** — paths created or modified this session, one line each on what changed.
   - **Next steps** — the immediate actionable items, in order.
   - **Open questions / blockers** — anything unresolved or awaiting the user.
   - **Useful commands** — exact commands to run/build/test/verify, ready to paste.

Guidelines:
- Summarize; do not paste the raw transcript. Aim for something a new session could act on in under a minute of reading.
- Be specific with file paths and commands — they render as clickable references.
- Only include what actually happened; do not invent state.
- $ARGUMENTS

After writing, tell the user the file path.
