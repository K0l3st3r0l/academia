#!/usr/bin/env bash
# Generates one image with Codex (GPT image tool) using the configuration that won the
# 2026-10-02 comparison: gpt-6-luna, low effort, prompt passed verbatim, exactly one call.
# Luna sometimes calls the image tool again on its own; each call spends image quota, so
# Codex is stopped as soon as its first image appears and that image is used.
# Usage: art/gen.sh <output.png> <prompt.txt> [reference.png ...]
# The prompt file holds only the image description (style + content).
set -euo pipefail

out=$1; prompt_file=$2; shift 2
refs=()
# Codex runs from a temp dir, so references must be absolute paths.
for r in "$@"; do refs+=(-i "$(realpath "$r")"); done
name=$(basename "$out")
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

{
  printf 'Call tools.image_gen__imagegen EXACTLY ONCE, passing the text between <prompt> and </prompt> as the prompt, verbatim, without rewriting or adding anything. Do not generate a second image, do not critique or retry. Then copy the generated file to ./%s in the current working directory.\n<prompt>\n' "$name"
  cat "$prompt_file"
  printf '\n</prompt>\n'
} > "$workdir/task.txt"

(cd "$workdir" && exec timeout 600 codex exec --skip-git-repo-check -s workspace-write \
  -m gpt-6-luna -c model_reasoning_effort=low "${refs[@]}" < task.txt > codex.log 2>&1) &
codex_pid=$!

find_session_dir() {
  local recent session sid
  mapfile -t recent < <(find ~/.codex/sessions -name '*.jsonl' -newer "$workdir/task.txt" 2>/dev/null)
  [ ${#recent[@]} -gt 0 ] || return 1
  session=$(grep -l "$name" "${recent[@]}" 2>/dev/null | head -1) || return 1
  sid=$(basename "$session" .jsonl | grep -oE '[0-9a-f]{8}-[0-9a-f-]{27}$') || return 1
  echo ~/.codex/generated_images/"$sid"
}

images=()
dir=""
while kill -0 "$codex_pid" 2>/dev/null; do
  [ -z "$dir" ] && dir=$(find_session_dir || true)
  if [ -n "$dir" ] && compgen -G "$dir/*.png" > /dev/null; then
    sleep 2  # let the file finish writing
    pkill -P "$codex_pid" 2>/dev/null || true
    kill "$codex_pid" 2>/dev/null || true
    break
  fi
  sleep 2
done
wait "$codex_pid" 2>/dev/null || true
[ -z "$dir" ] && dir=$(find_session_dir || true)
[ -n "$dir" ] && [ -d "$dir" ] && mapfile -t images < <(ls -tr "$dir"/*.png 2>/dev/null)
if [ ${#images[@]} -eq 0 ]; then
  echo "No se generó ninguna imagen. Registro de Codex:" >&2; tail -20 "$workdir/codex.log" >&2; exit 1
fi
cp "${images[0]}" "$out"
tokens=$(grep -A1 'tokens used' "$workdir/codex.log" | tail -1 || true)  # absent when Codex was stopped early
echo "$out · imágenes generadas: ${#images[@]} · tokens: ${tokens:-?}"
