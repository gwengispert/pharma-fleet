#!/usr/bin/env bash
# PreCompact hook: writes a readable context snapshot of the current session
# BEFORE Claude Code compacts (auto-compact when context runs low, or manual /compact).
# Must never fail the compaction: always exit 0.

set -o pipefail

input=$(cat)

tp=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
trigger=$(printf '%s' "$input" | jq -r '.trigger // "auto"' 2>/dev/null)
session=$(printf '%s' "$input" | jq -r '.session_id // "unknown"' 2>/dev/null)

# Where to write. Prefer the project dir the hook was invoked in.
root="${CLAUDE_PROJECT_DIR:-$PWD}"
outdir="$root/.claude/context-snapshots"
mkdir -p "$outdir" 2>/dev/null

ts=$(date +%Y%m%d-%H%M%S)
out="$outdir/context-$ts.md"

{
  echo "# Context snapshot"
  echo
  echo "- Saved: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "- Trigger: $trigger compaction"
  echo "- Session: $session"
  echo
  echo "---"
  echo
} > "$out" 2>/dev/null

# Extract the human-readable conversation (user + assistant text blocks) from the
# JSONL transcript. If anything goes wrong, we still keep the header above.
if [ -n "$tp" ] && [ -f "$tp" ]; then
  jq -rs '
    map(select(.type == "user" or .type == "assistant"))
    | .[]
    | (.message.role // .type) as $role
    | (.message.content) as $c
    | if ($c | type) == "string" then
        "## \($role)\n\n\($c)\n"
      else
        ([ $c[]? | select(.type == "text") | .text ] | join("\n\n")) as $t
        | if ($t | length) > 0 then "## \($role)\n\n\($t)\n" else empty end
      end
  ' "$tp" >> "$out" 2>/dev/null

  # Also keep the raw transcript alongside, in case the readable extract misses something.
  cp "$tp" "$outdir/transcript-$ts.jsonl" 2>/dev/null
fi

# Surface the path to the user in the CLI.
printf '{"systemMessage": "Context snapshot saved to %s"}\n' "$out"

exit 0
