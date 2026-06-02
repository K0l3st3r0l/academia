#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

# ─── Config ────────────────────────────────────────────────────────────────────
# PROXY_HOST_ID: ID del proxy host de games.laravas.com en NPM.
# Encuéntralo con:
#   sqlite3 /root/apps/proxy/data/database.sqlite "SELECT id, domain_names FROM proxy_host;"
# Actualiza este valor después de crear el proxy host en NPM.
PROXY_HOST_ID=11

NPM_CONF="/root/apps/proxy/data/nginx/proxy_host/${PROXY_HOST_ID}.conf"
NPM_DB="/root/apps/proxy/data/database.sqlite"
# ───────────────────────────────────────────────────────────────────────────────

echo -e "${BLUE}=== AcademIA — Zero-Downtime Frontend Deployment ===${NC}"

# Verify NPM config file exists
if [ ! -f "$NPM_CONF" ]; then
    echo -e "${RED}✗ NPM config not found: $NPM_CONF${NC}"
    echo -e "${YELLOW}  Pasos:"
    echo -e "  1. Crea el proxy host games.laravas.com en NPM"
    echo -e "  2. Busca su ID: sqlite3 $NPM_DB \"SELECT id, domain_names FROM proxy_host;\""
    echo -e "  3. Actualiza PROXY_HOST_ID en este script${NC}"
    exit 1
fi

# Determine active slot from NPM DB
CURRENT_HOST=$(sqlite3 "$NPM_DB" "SELECT forward_host FROM proxy_host WHERE id=${PROXY_HOST_ID};")

if [[ "$CURRENT_HOST" == *"blue"* ]]; then
    NEW_COLOR="green"
    NEW_HOST="academia-frontend-green-1"
    NEW_PORT="4102"
    OLD_COLOR="blue"
    OLD_HOST="academia-frontend-blue-1"
else
    NEW_COLOR="blue"
    NEW_HOST="academia-frontend-blue-1"
    NEW_PORT="4101"
    OLD_COLOR="green"
    OLD_HOST="academia-frontend-green-1"
fi

echo -e "${YELLOW}Activo: $OLD_COLOR ($OLD_HOST) → Construyendo: $NEW_COLOR ($NEW_HOST)${NC}"

# ── Paso 1: Build del nuevo slot ───────────────────────────────────────────────
echo -e "${BLUE}[1/5] Construyendo frontend-$NEW_COLOR...${NC}"
if [ "$NEW_COLOR" = "green" ]; then
    docker compose --env-file .env --profile green build frontend-green
    docker compose --env-file .env --profile green up -d --no-build frontend-green
else
    docker compose --env-file .env build frontend-blue
    docker compose --env-file .env up -d --no-build frontend-blue
fi

# ── Paso 2: Esperar que el nuevo slot esté listo ───────────────────────────────
echo -e "${BLUE}[2/5] Esperando que frontend-$NEW_COLOR esté disponible en :${NEW_PORT}...${NC}"
MAX_ATTEMPTS=30
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    if curl -sf "http://localhost:${NEW_PORT}" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ frontend-$NEW_COLOR listo${NC}"
        break
    fi
    echo "   Intento $ATTEMPT/$MAX_ATTEMPTS..."
    sleep 10
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo -e "${YELLOW}⚠ Timeout esperando frontend-$NEW_COLOR. Continuando de todos modos...${NC}"
fi

# ── Paso 3: Switch atómico de nginx ───────────────────────────────────────────
echo -e "${BLUE}[3/5] Cambiando tráfico nginx → $NEW_COLOR ($NEW_HOST)...${NC}"
sed -i "s|  set \\\$server.*|  set \$server         \"$NEW_HOST\";|" "$NPM_CONF"
sqlite3 "$NPM_DB" "UPDATE proxy_host SET forward_host='$NEW_HOST', modified_on=datetime('now') WHERE id=${PROXY_HOST_ID};"
docker exec proxy-app-1 nginx -s reload
echo -e "${GREEN}✓ Tráfico en $NEW_COLOR${NC}"

# ── Paso 4: Detener el slot anterior ──────────────────────────────────────────
echo -e "${BLUE}[4/5] Deteniendo $OLD_HOST...${NC}"
docker stop "$OLD_HOST" 2>/dev/null && docker rm "$OLD_HOST" 2>/dev/null || true
echo -e "${GREEN}✓ $OLD_HOST detenido${NC}"

# ── Paso 5: Limpiar imágenes antiguas ─────────────────────────────────────────
echo -e "${BLUE}[5/5] Limpiando imágenes Docker antiguas...${NC}"
docker image prune -af --filter "label!=keep-me" 2>/dev/null || true
echo -e "${GREEN}✓ Imágenes limpias (base de datos intacta)${NC}"

echo ""
echo -e "${GREEN}=== Deploy completado ===${NC}"
ACTIVE_HOST=$(sqlite3 "$NPM_DB" "SELECT forward_host FROM proxy_host WHERE id=${PROXY_HOST_ID};")
echo -e "Slot activo: ${BLUE}$NEW_COLOR ($ACTIVE_HOST)${NC}"
echo -e "Run ${YELLOW}docker system df${NC} para ver uso de disco"
