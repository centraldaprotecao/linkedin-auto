#!/usr/bin/env bash
# Cópia diária do banco: guarda 14 dias no servidor e envia uma cópia para o Google Drive do cliente (30 dias).
# A cópia externa só funciona depois de configurar o rclone com o remote "drive" (ver COPIA-EXTERNA.md).
set -euo pipefail
cd "$(dirname "$0")"
OUT=/var/backups/linkedin-auto; mkdir -p "$OUT"
FILE="$OUT/app-$(date +%F).sql.gz"
docker compose exec -T db pg_dump -U app -d app | gzip > "$FILE"
find "$OUT" -name 'app-*.sql.gz' -mtime +14 -delete

if command -v rclone >/dev/null && rclone listremotes | grep -q '^drive:$'; then
  rclone copy "$FILE" drive:Backup-sistema
  rclone delete drive:Backup-sistema --min-age 30d
else
  echo "$(date -Is) AVISO: cópia externa NÃO configurada; backup só está dentro do servidor." >&2
fi
