#!/usr/bin/env bash
# Copia o banco antigo (Neon/Vercel) para o banco novo desta VPS. Uso: ./migrar-banco.sh "<DATABASE_URL antiga>"
# Rode ANTES de subir o app pela primeira vez (ou com o app parado). A URL antiga não é gravada em lugar nenhum.
set -euo pipefail
cd "$(dirname "$0")"
OLD="${1:?informe a DATABASE_URL antiga entre aspas}"
docker compose up -d db
docker compose exec -T db sh -c 'until pg_isready -U app -d app; do sleep 1; done'
docker run --rm postgres:17-alpine pg_dump --no-owner --no-acl "$OLD" | docker compose exec -T db psql -U app -d app -v ON_ERROR_STOP=1 -q
echo "Banco copiado. Confira: docker compose exec db psql -U app -d app -c 'select count(*) from \"Lead\"'"
