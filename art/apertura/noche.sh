#!/usr/bin/env bash
# Waits for Grok's weekly balance (back at 21:45 on 2026-10-09), makes the voiced clips in
# guion.json's priority order plus the portal shot, and recuts the film. Anything Grok cannot
# make keeps its stand-in (subtitles, still frame) until the next run.
cd "$(dirname "$0")"
VENV=/tmp/claude-0/-root-apps/16c59e03-9029-41f5-bb9a-460bf85adb99/scratchpad/venv/bin/python
target=$(date -d 'today 21:47' +%s)
while [ "$(date +%s)" -lt "$target" ]; do sleep 60; done
echo "== voces $(date +%H:%M)"
python3 gen-voz.py
echo "== portal $(date +%H:%M)"
bash clips/generar.sh
cat clips/estado.log | tail -2
echo "== montaje $(date +%H:%M)"
bash /root/apps/wiki/deploy-guard.sh run academia/apertura-montaje -- "$VENV" montar.py
echo "== fin $(date +%H:%M)"
