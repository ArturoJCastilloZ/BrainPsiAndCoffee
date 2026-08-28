# NO CORRAS supabase-schema.sql

Este era el esquema monolitico del proyecto. Se conserva como referencia
historica y porque `tests/tenancy/run.sh` lo usa para construir la base
de partida antes de aplicar las migraciones.

**Ya no se aplica a mano, ni en local ni en Supabase.** Desde la Fase 2
el esquema se cambia solo con migraciones versionadas:

```bash
export DATABASE_URL="<connection string>"
./scripts/migrate.sh status   # que falta
./scripts/migrate.sh up       # aplicarlo
```

## Por que no

El monolito hace `drop policy` + `create policy` sobre 49 policies. La
migracion 0005 reescribio esas mismas policies para incluir el filtro
por tenant. Correr este archivo encima **borra las policies con
aislamiento y restaura las viejas, sin tenant** — y no lanza un solo
error: termina con exito y deja el aislamiento entre clinicas apagado en
silencio. Es la clase de regresion que nadie nota hasta que un cliente ve
los datos de otro.
