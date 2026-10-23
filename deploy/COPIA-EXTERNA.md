# Cópia de segurança extra fora do servidor (Google Drive da DOR$)

O Supabase já guarda cópias automáticas. Esta é a segunda camada, em outra conta, para o caso de problema na conta do Supabase.
Feito uma vez, em chamada com a DOR$ (uns 10 minutos). A DOR$ precisa estar logada no Google dela.

**Atenção (auditoria F-01):** esta cópia usa a conexão do usuário `postgres`, que enxerga TODOS os esquemas. Por isso ela **não pode rodar na VPS do Deskcomm** (aberta na internet e de terceiros): use uma máquina só da DOR$ (um computador do escritório ligado à noite ou uma VPS pequena separada). Onde diz "VPS" abaixo, leia "a máquina da cópia".

1. Na máquina da cópia: `apt-get install -y postgresql-client rclone` (se o `rclone` do pacote for antigo, use `curl https://rclone.org/install.sh | bash`).
2. Crie `deploy/backup.env` com uma linha: `BACKUP_DATABASE_URL=<conexão direta do Supabase, porta 5432>` e `chmod 600 deploy/backup.env`. (Nunca vai para o git.)
3. No computador do Lucas (com navegador): `rclone authorize "drive"` → a DOR$ faz login e autoriza → copie o texto `{"access_token":...}` que o comando imprime.
4. Na VPS: `rclone config` → `n` (novo) → nome `drive` → tipo `drive` → deixe client_id/secret em branco → scope `3` (só arquivos criados pelo rclone) → "Use auto config?" responda `n` → cole o texto do passo 3.
5. Agende: `30 3 * * * root /caminho/deploy/backup.sh >> /var/log/dors-backup.log 2>&1` em `/etc/cron.d/dors-backup`.
6. Teste: rode `./backup.sh` e confira o arquivo na pasta `Backup-sistema` do Drive da DOR$.
7. **Teste de restauração (obrigatório antes de entregar):** crie um banco vazio de teste (um projeto Supabase descartável ou um Postgres local), baixe o arquivo e rode `gunzip -c dors-AAAA-MM-DD.sql.gz | psql "<conexão do banco de teste>"`. Confira que as tabelas do esquema `central` voltaram.

Sem o passo 4 o `backup.sh` avisa no log que a cópia externa não está ligada.
