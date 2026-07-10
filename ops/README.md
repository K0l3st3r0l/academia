# Backups de base de datos — AcademIA

## Qué hace `backup-db.sh`

- Ejecuta `pg_dump` **solo** de la base `academia` (nunca `academia_test`) dentro del contenedor `academia-db`.
- Comprime el resultado con `gzip` y lo guarda en `backups/academia_YYYY-MM-DD_HHMM.sql.gz`.
- Verifica que el dump no esté vacío y que contenga sentencias `CREATE TABLE` antes de darlo por válido.
- Elimina backups de más de 14 días (solo archivos `academia_*.sql.gz` dentro de `backups/`).
- Es una operación 100% de lectura sobre la base de datos: no modifica, no borra, no hace `DROP`/`TRUNCATE`.

## Cron

Corre todos los días a las 03:30 vía crontab de `root`:

```
30 3 * * * /root/apps/academia/ops/backup-db.sh >> /root/apps/academia/backups/backup.log 2>&1
```

Ver cron instalado:

```bash
crontab -l
```

## Verificar integridad de un backup

Sin descomprimir ni tocar la base de datos:

```bash
# Verifica que el gzip no esté corrupto
gzip -t /root/apps/academia/backups/academia_2026-07-09_0330.sql.gz

# Revisa que contenga estructura (CREATE TABLE) y datos (COPY ... FROM stdin)
zcat /root/apps/academia/backups/academia_2026-07-09_0330.sql.gz | grep -c '^CREATE TABLE'
zcat /root/apps/academia/backups/academia_2026-07-09_0330.sql.gz | grep -c '^COPY '

# Revisa el tamaño (un dump vacío pesa unos pocos KB)
ls -lh /root/apps/academia/backups/academia_2026-07-09_0330.sql.gz
```

## Procedimiento de restore

⚠️ **Esto sobrescribe datos. NO ejecutar contra la base de producción sin confirmación explícita del usuario.**
Esta sección es solo documentación — no fue ejecutada como parte de la creación de este sistema de backups.

### 1. Elegir el backup a restaurar

```bash
ls -lh /root/apps/academia/backups/
```

### 2. (Recomendado) Restaurar primero en una base de prueba

Antes de tocar `academia`, se puede validar el dump contra `academia_test` (o una base temporal nueva) para confirmar que el archivo restaura sin errores:

```bash
gunzip -c /root/apps/academia/backups/academia_2026-07-09_0330.sql.gz | \
  docker exec -i academia-db psql -U academia_user -d academia_test
```

### 3. Restaurar contra la base real (`academia`)

Requiere que no haya conexiones activas escribiendo durante la restauración, y confirmación explícita del usuario antes de ejecutar. Pasos:

```bash
# 1. Detener el backend para evitar escrituras concurrentes
docker compose -f /root/apps/academia/docker-compose.yml stop backend

# 2. (Opcional pero recomendado) Respaldar el estado actual antes de restaurar,
#    por si hay que revertir
/root/apps/academia/ops/backup-db.sh

# 3. Restaurar el dump elegido
gunzip -c /root/apps/academia/backups/academia_YYYY-MM-DD_HHMM.sql.gz | \
  docker exec -i academia-db psql -U academia_user -d academia

# 4. Levantar el backend de nuevo
docker compose -f /root/apps/academia/docker-compose.yml start backend
```

### Notas

- `psql` durante el restore puede mostrar errores de "already exists" si la base ya tiene las tablas creadas por las migraciones automáticas del backend (ver `backend/src/db/migrate.js`); en ese caso conviene restaurar contra una base recién creada y vacía, no contra `academia` con tablas existentes.
- Nunca usar `docker compose down -v` para "limpiar" antes de un restore: eso borra el volumen completo de PostgreSQL, incluyendo `academia_test` y cualquier otro dato.
- El restore real contra producción requiere confirmación explícita del usuario — este documento no autoriza ejecutarlo por sí solo.