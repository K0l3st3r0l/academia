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

# Levantar todo
docker compose --env-file .env up -d --build

# Solo backend
docker compose --env-file .env up -d --build backend

# Solo frontend
docker compose --env-file .env up -d --build frontend

# Ver logs
docker compose --env-file .env logs -f backend
docker compose --env-file .env logs -f frontend

# Reiniciar sin rebuild
docker compose --env-file .env restart backend
```

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

## Arquitectura de sockets
- El servidor mantiene el estado del juego en memoria (Map de rooms)
- El timer del servidor es autoritativo (nunca confiar en el cliente)
- Los eventos de juego siguen el patrón: `namespace:accion` (ej: `game:answer`)

---

## 📚 Wiki

Conocimiento acumulado de este proyecto en `/root/apps/wiki/projects/academia/`.
Al terminar tareas relevantes, actualizar la wiki según `/root/apps/CLAUDE.md`.
