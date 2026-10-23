-- Papéis do banco: cada sistema só enxerga o próprio esquema (auditoria de segurança F-01).
--
-- Por quê: o Deskcomm roda numa VPS aberta na internet. Se ele usasse a conexão de dono do Supabase (a "postgres"),
-- quem invadisse a VPS leria os contatos, as mensagens e as senhas de TODOS os clientes da DOR$ e os administradores do painel.
-- Com estes papéis, o Deskcomm só alcança o esquema "public"; o sistema só o "central"; o painel só o "backoffice".
--
-- Quando: UMA vez, antes da migração do sistema e do primeiro acesso do painel, como o usuário "postgres" do Supabase,
-- por psql (precisa de -v para as senhas; o editor SQL do site não aceita variáveis):
--   psql "<conexão direta, usuário postgres>" -v ON_ERROR_STOP=1 \
--        -v senha_sistema="<gerar>" -v senha_painel="<gerar>" -v senha_deskcomm="<gerar>" -f deploy/papeis-banco.sql
-- Senhas: `openssl rand -hex 24`, guardadas no gerenciador de senhas da DOR$. Nunca em chat, e-mail ou commit.
--
-- Depois: cada sistema usa SÓ a sua senha (docs/instalacao-dors.md, passo 1). A senha do "postgres" não sai da mão da DOR$.

CREATE ROLE sistema  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE painel   LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE deskcomm LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
SELECT format('ALTER ROLE sistema  WITH PASSWORD %L', :'senha_sistema')  \gexec
SELECT format('ALTER ROLE painel   WITH PASSWORD %L', :'senha_painel')   \gexec
SELECT format('ALTER ROLE deskcomm WITH PASSWORD %L', :'senha_deskcomm') \gexec

-- O "postgres" do Supabase não é superusuário: precisa ser membro do papel para criar o esquema em nome dele.
GRANT sistema, painel, deskcomm TO CURRENT_USER;

-- Cada esquema pertence ao seu papel, e ninguém mais (nem PUBLIC) entra nele.
CREATE SCHEMA IF NOT EXISTS central    AUTHORIZATION sistema;
CREATE SCHEMA IF NOT EXISTS backoffice AUTHORIZATION painel;
REVOKE ALL ON SCHEMA central, backoffice FROM PUBLIC;

-- Deskcomm: dono do que ele cria em "public" (as migrações dele rodam como este papel, nunca como "postgres").
GRANT USAGE, CREATE ON SCHEMA public TO deskcomm;
-- As tabelas que o Deskcomm cria precisam dos mesmos acessos que o Supabase dá por padrão às tabelas de "public"
-- (a chave de serviço e a API do Supabase passam por esses papéis).
ALTER DEFAULT PRIVILEGES FOR ROLE deskcomm IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE deskcomm IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE deskcomm IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- O sistema e o painel não têm nada em "public". (Sem GRANT, o que o Deskcomm cria lá fica fechado para eles.)
REVOKE ALL ON SCHEMA public FROM sistema, painel;
-- Esquemas novos no banco: só o sistema pode (e só por causa da migração dele, que roda "CREATE SCHEMA IF NOT EXISTS public";
-- o Postgres confere esta permissão mesmo quando o esquema já existe). Painel e Deskcomm não criam esquemas.
SELECT format('REVOKE CREATE ON DATABASE %I FROM painel, deskcomm', current_database()) \gexec
SELECT format('GRANT CREATE ON DATABASE %I TO sistema', current_database()) \gexec
