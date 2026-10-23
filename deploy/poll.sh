#!/usr/bin/env bash
# Chama o robô do sistema (o mesmo que o cron-job.org chamava na Vercel).
cd "$(dirname "$0")"
SECRET=$(grep '^CRON_SECRET=' .env | cut -d= -f2-)
curl -fsS -m 130 -H "Authorization: Bearer $SECRET" http://127.0.0.1:3100/api/cron/poll >/dev/null
