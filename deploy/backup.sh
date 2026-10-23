#!/usr/bin/env bash
# Cópia extra diária do banco (Supabase da DOR$): guarda 14 dias no servidor e envia para o Google Drive da DOR$ (30 dias).
# O Supabase já faz cópias automáticas; esta é a segunda camada, fora dele. Roda na VPS do Deskcomm (cron).
# Precisa de: postgresql-client (versão igual ou maior que a do Supabase), um arquivo deploy/backup.env com
#   BACKUP_DATABASE_URL=<conexão direta do Supabase, porta 5432>
# e, para a cópia externa, o rclone com o remote "drive" (ver COPIA-EXTERNA.md).
set -euo pipefail
cd "$(dirname "$0")"
if [ -f backup.env ]; then set -a; . ./backup.env; set +a; fi
: "${BACKUP_DATABASE_URL:?preencha BACKUP_DATABASE_URL em deploy/backup.env}"
OUT=/var/backups/dors; mkdir -p "$OUT"
FILE="$OUT/dors-$(date +%F).sql.gz"
# public = Deskcomm; central = sistema; backoffice = central de clientes.
pg_dump --no-owner --schema=public --schema=central --schema=backoffice "$BACKUP_DATABASE_URL" | gzip > "$FILE"
[ -s "$FILE" ] || { echo "$(date -Is) ERRO: cópia vazia" >&2; exit 1; }
find "$OUT" -name 'dors-*.sql.gz' -mtime +14 -delete

if command -v rclone >/dev/null && rclone listremotes | grep -q '^drive:$'; then
  rclone copy "$FILE" drive:Backup-sistema
  rclone delete drive:Backup-sistema --min-age 30d
else
  echo "$(date -Is) AVISO: cópia externa NÃO configurada; a cópia só está dentro do servidor." >&2
fi
