#!/usr/bin/env bash
# Instala/atualiza o sistema e a Central de clientes nesta VPS. Rode como root, de dentro da pasta deploy/: ./instalar.sh
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo "Docker não encontrado. Instale: curl -fsSL https://get.docker.com | sh"; exit 1; }

if [ ! -f .env ]; then
  cp .env.example .env
  for k in DB_PASSWORD CRON_SECRET OPS_SECRET BACKOFFICE_SECRET BACKOFFICE_SETUP_KEY; do
    sed -i "s|^$k=.*|$k=$(openssl rand -hex 24)|" .env
  done
  chmod 600 .env
  echo "Criei deploy/.env e gerei as senhas do servidor (banco, robô, operações, central de clientes)."
  echo "Instalação nova: gere também SESSION_SECRET (openssl rand -hex 32)."
  echo "Se for copiar o banco do sistema antigo: SESSION_SECRET e os segredos de webhook têm de ser os MESMOS valores de hoje (cifram as senhas guardadas)."
  echo "Preencha o resto do .env e rode de novo."; exit 0
fi
grep -q '^SESSION_SECRET=.\+' .env || { echo "SESSION_SECRET vazio no .env."; exit 1; }
set -a; . ./.env; set +a

docker compose up -d --build db
# Banco da Central de clientes: separado do banco do sistema, no mesmo servidor de banco.
docker compose exec -T db psql -U app -d app -tAc "SELECT 1 FROM pg_database WHERE datname='backoffice'" | grep -q 1 \
  || docker compose exec -T db psql -U app -d app -c "CREATE DATABASE backoffice"

docker compose up -d --build
echo "Aguardando o sistema e a central de clientes responderem..."
for i in $(seq 1 60); do
  curl -fs -o /dev/null http://127.0.0.1:3100/login && curl -fs -o /dev/null http://127.0.0.1:3300/login && break || sleep 3
done
curl -fs -o /dev/null http://127.0.0.1:3100/login && echo "Sistema no ar em 127.0.0.1:3100" || { echo "O sistema não respondeu. Veja: docker compose logs app"; exit 1; }
curl -fs -o /dev/null http://127.0.0.1:3300/login && echo "Central de clientes no ar em 127.0.0.1:3300" || { echo "A central de clientes não respondeu. Veja: docker compose logs backoffice"; exit 1; }

DIR="$(pwd)"
cat > /etc/cron.d/linkedin-auto <<CRON
*/15 * * * * root $DIR/poll.sh
30 3 * * * root $DIR/backup.sh >> /var/log/linkedin-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/linkedin-auto
echo "Agendamentos instalados (robô a cada 15 min, backup às 3h30)."
echo
echo "Falta: publicar os domínios no Caddy (sistema -> 127.0.0.1:3100, painel -> 127.0.0.1:3300)."
echo "Primeiro acesso da Central de clientes: abra ${BACKOFFICE_URL} e use o código de instalação (BACKOFFICE_SETUP_KEY do .env)."
