# Claude Code Guidelines — AcademIA

## Contexto del proyecto
Plataforma educativa gamificada autónoma. Plan Maestro en `/root/apps/ACADEMIA_PLAN_MAESTRO_V2.md`.

## Regla crítica de base de datos
Ver `/root/apps/CLAUDE.md`. Nunca usar `docker compose down -v`.

## Stack
- Backend: Node.js + Express + Socket.io + PostgreSQL 15
- Frontend: React 18 + Vite + Tailwind CSS
- Infra: Docker Compose

## Comandos clave
```bash
cd /root/apps/academia

# Deploy (build bajo el mutex global + migraciones + auto-commit/push + wiki-push).
# Nunca `docker compose build` / `up --build` a mano: se salta la guardia de deploys.
./deploy.sh

# Tras un deploy que recrea el backend, si /api da 502 (IP cacheada en NPM):
docker exec proxy-app-1 nginx -s reload

# Logs y reinicio sin rebuild
docker compose --env-file .env logs -f backend
docker compose --env-file .env restart backend

# Tests del backend (contra academia_test, nunca contra producción)
cd backend && npx vitest run

# Cuenta de alumno de prueba (RUT 11.111.111-1, curso 5°): genera e imprime un PIN nuevo.
# Opcional: otro curso como argumento. No usar credenciales de alumnos reales para probar.
docker exec academia-backend node scripts/test-student.js
```

Las cuentas de prueba llevan `local_students.is_test`: cualquier informe o estadística
agregada por curso debe excluirlas.

## Correo (enlaces para que el alumno cree su contraseña)
Credenciales en `.env.mail` (plantilla: `.env.mail.example`), que **solo lee el
backend**. No van en `.env`: ese archivo también lo lee la base, y tocarlo hace
que el próximo deploy recree el contenedor de PostgreSQL. Sin `.env.mail`, el
ingreso con correo queda oculto y los alumnos entran con RUT + PIN.

## Puertos
- Backend: 4100
- Frontend: 4101 (nginx sirviendo React build)
- PostgreSQL: 5434 (externo), 5432 (interno)

## Integración con Anahuac
- AcademIA llama a Anahuac solo por API externa (`ANAHUAC_API_URL`)
- Nunca exponer el token de Anahuac al frontend de AcademIA
- Anahuac token se usa solo en el backend para sincronizar datos
- Después de sync, AcademIA emite su propio JWT

## Migraciones de base de datos
Las migraciones están en `backend/src/db/migrations/`.
Se ejecutan automáticamente al iniciar el backend (ver `backend/src/db/migrate.js`).
Para agregar una migración: crear `NNN_descripcion.sql` con el número siguiente.
`migrate.js` registra la versión en `schema_migrations` al terminar (desde 2026-09-29;
antes cada archivo la insertaba al final y 007/008 lo olvidaron). Escribir las
migraciones idempotentes (`IF NOT EXISTS`) igual.

## Arquitectura de sockets
- El servidor mantiene el estado del juego en memoria (Map de rooms)
- El timer del servidor es autoritativo (nunca confiar en el cliente)
- Los eventos de juego siguen el patrón: `namespace:accion` (ej: `game:answer`)

---

## 📚 Wiki y grafo de código

**Antes de buscar con grep** (aplica a todo agente/modelo):
1. Si existe `graphify-out/graph.json` en este proyecto, consultarlo primero.
2. Revisar `/root/apps/wiki/projects/academia/overview.md` si existe.

Conocimiento acumulado de este proyecto en `/root/apps/wiki/projects/academia/`.
Al agregar o modificar algo relevante, actualizar la wiki según `/root/apps/CLAUDE.md`.
