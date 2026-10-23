#!/usr/bin/env bash
# Rode NA VPS ATUAL do Deskcomm. Só LÊ. Mostra a configuração sem segredos (valores de chave, token, senha e URL de banco saem como ***).
# Uso: bash coletar-deskcomm.sh | tee /root/deskcomm-config.txt   (depois cole o conteúdo no chat)
D=/root/deskcommcrm
M='KEY|SECRET|TOKEN|PASSWORD|PASS|JWT|HMAC|DATABASE_URL|DB_URL|DB_ADMIN|DSN'
mask() { sed -E "/^[^=:#]*($M)[^=:]*[=:]/I s/([=:] *).*/\1***/"; }
cd "$D" || exit 1
echo "## versão do código"; git log -1 --format='%H | %cd | %s' 2>&1; git status --short 2>&1 | head -20
git remote -v 2>&1 | sed -E 's#://[^@/]*@#://***@#'
echo; echo "## arquivos na pasta"; ls -la
echo; echo "## imagens em uso"; docker ps --format '{{.Names}} | {{.Image}}'
F=$(docker inspect deskcommcrm-app-1 --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}')
echo; echo "## compose em uso: $F"; IFS=',' read -ra FILES <<< "$F"; for f in "${FILES[@]}"; do echo "--- $f"; mask < "$f"; done
echo; echo "## arquivo .env (nomes e valores sem segredo)"; [ -f .env ] && mask < .env
echo; echo "## Caddyfile"; cat Caddyfile 2>/dev/null
for c in app worker scheduler waha srh redis caddy; do
  echo; echo "## variáveis de $c"; docker exec deskcommcrm-$c-1 printenv 2>/dev/null | sort | mask
done
echo; echo "## volumes e espaço"; docker volume ls; docker system df -v 2>/dev/null | sed -n 1,40p; du -sh "$D"
echo; echo "## chaves do .env que estão PREENCHIDAS (só os nomes)"
grep -E '^[A-Z_]+=.+' .env | grep -v '=""$' | cut -d= -f1 | sort | tr '\n' ' '; echo
echo; echo "## chaves do .env VAZIAS (só os nomes)"
grep -E '^[A-Z_]+=(""|)$' .env | cut -d= -f1 | sort | tr '\n' ' '; echo
