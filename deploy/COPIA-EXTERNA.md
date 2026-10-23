# Cópia de segurança fora do servidor (Google Drive do cliente)

Feito uma vez, em chamada com o cliente (leva uns 10 minutos). O cliente precisa estar logado no Google dele.

1. No servidor: `curl https://rclone.org/install.sh | bash`
2. No computador do Lucas (com navegador): `rclone authorize "drive"` → o cliente faz login e autoriza → copiar o texto `{"access_token":...}` que o comando imprime.
3. No servidor: `rclone config` → `n` (novo) → nome `drive` → tipo `drive` → deixar client_id/secret em branco → scope `3` (acesso só aos arquivos criados pelo rclone) → quando perguntar "Use auto config?" responder `n` → colar o texto do passo 2.
4. Teste: `./backup.sh` e conferir o arquivo na pasta `Backup-sistema` do Drive do cliente.
5. Teste de restauração (obrigatório antes de entregar): baixar o arquivo e rodar `gunzip -c app-AAAA-MM-DD.sql.gz | docker compose exec -T db psql -U app -d app` num banco de teste.

Sem esse passo o `backup.sh` avisa em `/var/log/linkedin-backup.log` que a cópia externa não está ligada.
