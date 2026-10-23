# Instalação do sistema da DOR$ (roteiro de quem monta)

Roteiro da Fase 2 e 3 do `PROJECT-MAP.md`. Só começa quando as 12 contas do "Guia das suas contas" estiverem prontas (gate da Fase 1).
Tudo é novo e fica em contas da DOR$. **Nada daqui toca a Vercel, o Neon ou o cron-job.org do Lucas.**

Quatro endereços no domínio da DOR$: `app.` (sistema), `painel.` (central de clientes), `crm.` (WhatsApp) e `links.` (links dos e-mails; pode ser o mesmo `app.` se não houver motivo para separar — então deixe `TRACKING_URL` vazio).

## 0. Antes de começar
- Código: os repositórios `linkedin-auto` e `DeskcommCRM` já estão na conta do GitHub da DOR$ (privados). A branch `feat/multi-cliente` foi mesclada na `master` **do repositório da DOR$** (nunca no do Lucas).
- Segredos novos: gere com `openssl rand -hex 32` — `SESSION_SECRET`, `CRON_SECRET`, `OPS_SECRET`, `BACKOFFICE_SECRET`, `BACKOFFICE_SETUP_KEY`, `EDGES_WEBHOOK_SECRET`, `DESKCOMM_WEBHOOK_SECRET`. Guarde num gerenciador de senhas da DOR$; nunca em chat, e-mail ou commit.
- `SESSION_SECRET` não pode mudar depois que houver senhas guardadas (caixas de e-mail, Google, WhatsApp): o que está cifrado deixa de abrir.

## 1. Supabase (um projeto, três esquemas)
1. Na organização da DOR$ (plano Pro), crie **um** projeto, região `sa-east-1` (São Paulo). Anote a senha do banco.
2. Em **Connect**, copie duas conexões: a **direta** (porta 5432) e a do **Transaction pooler** (porta 6543).
3. Esquemas: `public` é do Deskcomm (passo 6); `central` é criado pela migração do sistema (passo 3); `backoffice` é criado pelo próprio painel no primeiro acesso.
4. Premissa ainda não provada com um Supabase de verdade: o pooler (porta 6543) com a Vercel e a migração no esquema `central`. Em teste local tudo passou. Se o pooler der problema, use o **Session pooler** (porta 5432 do pooler) no `DATABASE_URL`.

## 2. Vercel (dois projetos)
No time da DOR$ (plano Pro):

**Projeto `sistema`** — repositório `linkedin-auto`, pasta raiz `/`.
- Variáveis: todas as de `.env.example` (raiz). `DATABASE_URL` = pooler (6543) **sem** `schema` na URL; `DIRECT_URL` = conexão direta (5432) com `?schema=central`; `DATABASE_SCHEMA=central`.
- Domínio: `app.` → o projeto. O `vercel.json` já traz o agendador (`/api/cron/poll` a cada 15 minutos); a Vercel envia sozinha o `Authorization: Bearer <CRON_SECRET>`.
- O robô, com mais de um cliente, chama a si mesmo uma vez por cliente (cada chamada tem o próprio limite de tempo).

**Projeto `painel`** — o mesmo repositório, pasta raiz `backoffice`.
- Variáveis: as de `backoffice/.env.example`. `BACKOFFICE_DATABASE_URL` = pooler (6543); `BACKOFFICE_DB_SCHEMA=backoffice`; `SISTEMA_URL=https://app.…`; `OPS_SECRET` = o mesmo do projeto `sistema`.
- Domínio: `painel.` → o projeto.

## 3. Migração do banco do sistema
No computador de quem monta, com o código da DOR$:
```
DIRECT_URL="<conexão direta>?schema=central" npx prisma migrate deploy
```
Cria o esquema `central` e todas as tabelas (inclui a migração multi-cliente). É a única forma de mudar o banco: migração manual, sempre antes de publicar o código que depende dela.

## 4. Primeiro acesso do painel e o cliente 1
1. Abra `https://painel.…` → "Primeiro acesso" → código de instalação (`BACKOFFICE_SETUP_KEY`) → crie o administrador (e-mail e senha da pessoa da DOR$).
2. **Novo cliente** → "DOR$" (nome do primeiro usuário e plano da própria DOR$). O painel mostra o link para a pessoa escolher a senha.
3. Anote o **id do cliente** (aparece na barra de endereço: `/clientes/<id>`).

## 5. Importar o conteúdo que já existe
O Lucas gerou `entrega/conteudo-dors.json` (7 campanhas, 52 trechos do manual da Helena, ajustes), já sem os vínculos com contas dele. Com o arquivo no computador de quem monta:
```
DATABASE_URL="<pooler ou direta>" DATABASE_SCHEMA=central SESSION_SECRET="…" npx tsx scripts/importar-conteudo.ts <id-do-cliente>
```
Recusa se o cliente já tiver campanhas ou manual. O cliente continua **pausado** e em **modo de aprovação**.

## 6. Deskcomm (WhatsApp) na VPS da DOR$
1. DNS: `crm.` aponta para o IP da VPS. Ubuntu, Docker instalado, firewall só com 22 (ou a porta de administração), 80 e 443.
2. Clone o fork `DeskcommCRM` da conta da DOR$ e gere a imagem no GitHub da DOR$ (`ghcr.io/<usuario>/deskcommcrm:fork-latest`). Sem o fork não há QR, troca de número nem histórico com mídia.
3. `deploy/deskcomm.env.modelo` é o `.env` de partida (mesmas versões e decisões do Deskcomm atual). Preencha as linhas "GERAR NOVO" e as do Supabase **da DOR$**; `APP_IMAGE` aponta para a imagem da DOR$. A lista completa e mascarada do Deskcomm atual está com o Lucas (`entrega/deskcomm-config-lucas-mascarada.txt`, fora do git).
4. Suba com o instalador do próprio Deskcomm (`ubuntu-production-installer.sh`) ou com `docker-compose.prod.yml`. Confira que `worker` e `scheduler` ficam em 1.69.0 e o WAHA em `latest-2026.7.2`, engine NOWEB.
5. Supabase: as migrações do Deskcomm rodam no esquema `public` (o instalador faz isso).
6. Crie uma **organização por cliente** (a primeira: DOR$) e uma **chave de acesso** com `mcp:read`, `mcp:write` e `role:manager`. A chave entra no painel (cliente › WhatsApp › "Guardar a chave"); o painel testa e guarda cifrada.
7. Aviso instantâneo: no Deskcomm, regra (gatilho `message.received`, ação "Chamar webhook") para `https://app.…/api/webhooks/deskcomm` com o segredo `DESKCOMM_WEBHOOK_SECRET`.
8. Cópia extra no Drive da DOR$: `deploy/COPIA-EXTERNA.md`.

## 7. Contas externas (webhooks e retornos)
- **Edges:** webhook em Developer Settings › Webhooks → `https://app.…/api/webhooks/edges`, cabeçalho `X-Webhook-Secret` = `EDGES_WEBHOOK_SECRET`. O cliente conecta o LinkedIn em Ajustes (chamada). **Conferir no ensaio:** que o aviso de "sessão caiu" traz a identidade (senão ele é ignorado — ver `identityOf` em `src/app/api/webhooks/edges/route.ts`).
- **Google:** URI de redirecionamento `https://app.…/api/email/google/callback`; app **publicado** ("Em produção").
- **OpenRouter:** a chave "Sistema" em `NOUS_API_KEY` (com `NOUS_BASE_URL=https://openrouter.ai/api/v1`); a "CRM" no `.env` do Deskcomm.
- **ElevenLabs:** plano Starter ou acima (gravar a própria voz exige plano pago). **Nunca foi testado com chave paga.**

## 8. Caixas de e-mail (InboxKit)
Painel › cliente › "Caixas de e-mail de envio": endereço, senha, servidores (já vêm com os do Google) e limite (30). O sistema só guarda a caixa se conseguir enviar e ler. Caixa nova começa em 5 e-mails/dia e sobe 1 por dia; o aviso de aquecimento aparece em Ajustes › E-mail do cliente.

## 9. Ensaio (envio desligado) — checklist
- [ ] Dois clientes de teste criados no painel: um não vê o outro (contatos, campanhas, mensagens, caixas).
- [ ] Cliente pausado perde o acesso; reativado volta.
- [ ] "Rodar o robô agora" funciona; o Vercel Cron aparece nos logs a cada 15 minutos.
- [ ] Pooler do Supabase: sem erro de conexão com 2 clientes ao mesmo tempo.
- [ ] LinkedIn conecta (Edges, chamada) e o aviso de integração traz a identidade.
- [ ] WhatsApp: chave guardada, QR lido, mensagem de entrada chega pelo webhook; ids de conversa estáveis.
- [ ] Voz: gravar a própria voz e mandar um áudio (plano pago).
- [ ] Caixa de teste: envio, leitura, devolução (bounce) e o aviso de aquecimento.
- [ ] Restauração de uma cópia testada (`deploy/COPIA-EXTERNA.md`, passo 7).
- [ ] Capacidade do WAHA na VPS com várias sessões.

## 10. Ligar
1. Cada cliente conecta LinkedIn, WhatsApp e Google; cadastra as caixas; confere o conteúdo importado (campanhas, manual).
2. Mensagem de teste real; aprovação manual ligada.
3. Tire o modo pausado (Ajustes) só depois de aprovar as primeiras mensagens.

## 11. Depois de ligar (7 dias)
Acompanhar pelo painel (saúde por cliente). Depois: desligar o que era do Lucas (Vercel, Neon, cron-job.org, VPS antiga), revogar as chaves antigas, tirar o Lucas de todas as contas e entregar o documento com cada conta, custo e renovação.

## Voltar atrás
Antes de ligar: nada a desfazer fora das contas novas. Depois de ligar: pausar o cliente no painel (o robô para) e, se preciso, reapontar os avisos do Edges e do Deskcomm.
