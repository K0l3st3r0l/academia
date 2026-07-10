#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$PROJECT_DIR/backups"
ENV_FILE="$PROJECT_DIR/.env"
CONTAINER="academia-db"
DB_NAME="academia"
RETENTION_DAYS=14

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

fail() {
    log "ERROR: $*"
    exit 1
}

[ -f "$ENV_FILE" ] || fail "no se encontró $ENV_FILE"

# shellcheck disable=SC1090
DB_USER="$(grep -m1 '^DB_USER=' "$ENV_FILE" | cut -d= -f2-)"
[ -n "${DB_USER:-}" ] || fail "DB_USER no definido en $ENV_FILE"

set +o pipefail
docker ps --filter "name=^${CONTAINER}$" --filter "status=running" --format '{{.Names}}' | grep -q "^${CONTAINER}$"
CONTAINER_RUNNING=$?
set -o pipefail
if [ "$CONTAINER_RUNNING" -ne 0 ]; then
    fail "el contenedor $CONTAINER no está corriendo"
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date '+%Y-%m-%d_%H%M')"
OUT_FILE="$BACKUP_DIR/academia_${TIMESTAMP}.sql.gz"
TMP_FILE="$(mktemp "$BACKUP_DIR/.tmp_academia_${TIMESTAMP}_XXXXXX.sql.gz")"

cleanup() {
    [ -f "$TMP_FILE" ] && rm -f "$TMP_FILE"
}
trap cleanup EXIT

log "iniciando dump de la base '$DB_NAME' desde $CONTAINER"

if ! docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$TMP_FILE"; then
    fail "pg_dump falló para la base $DB_NAME"
fi

# gzip vacío (sin contenido real de dump) pesa ~20-30 bytes
MIN_SIZE=100
ACTUAL_SIZE="$(stat -c%s "$TMP_FILE" 2>/dev/null || stat -f%z "$TMP_FILE")"
if [ "$ACTUAL_SIZE" -lt "$MIN_SIZE" ]; then
    fail "el dump quedó vacío o incompleto ($ACTUAL_SIZE bytes)"
fi

set +o pipefail
zcat "$TMP_FILE" | grep -q '^CREATE TABLE'
HAS_TABLES=$?
set -o pipefail
if [ "$HAS_TABLES" -ne 0 ]; then
    fail "el dump no contiene sentencias CREATE TABLE, se descarta"
fi

mv "$TMP_FILE" "$OUT_FILE"
trap - EXIT

log "backup creado: $OUT_FILE ($ACTUAL_SIZE bytes)"

log "rotando backups de más de $RETENTION_DAYS días en $BACKUP_DIR"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'academia_*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete

log "backup completado exitosamente"
