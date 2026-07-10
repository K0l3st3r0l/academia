# AcademIA backend

## Tests

Los tests (Vitest) corren contra una base de datos Postgres **desechable**, separada de
`academia` (producción). Nunca tocan la base real — `tests/setup.js` aborta con un error
claro si la configuración resuelta apunta a una base llamada `academia`.

Requisitos: el contenedor `academia-db` corriendo (expone Postgres en `localhost:5434`).

```bash
docker compose -f ../docker-compose.yml up -d db

npm test
```

Por defecto se conecta a `localhost:5434` con el mismo `DB_USER`/`DB_PASSWORD` de `../.env`
y usa/crea la base `academia_test` en ese mismo contenedor (se crea sola si no existe, y las
migraciones de `src/db/migrations/` se aplican automáticamente).

Para apuntar a otra base de test, usar variables de entorno:

```bash
# opción 1: URL completa
TEST_DATABASE_URL=postgres://user:pass@host:5432/otra_db_test npm test

# opción 2: piezas sueltas
TEST_DB_HOST=localhost TEST_DB_PORT=5434 TEST_DB_NAME=academia_test npm test
```

En cualquier caso, si el nombre de base resuelto es `academia`, el setup falla antes de
correr un solo test.

Los tests corren en serie (`fileParallelism: false` en `vitest.config.js`) y cada test
empieza con las tablas truncadas — así son deterministas al repetir `npm test`.
