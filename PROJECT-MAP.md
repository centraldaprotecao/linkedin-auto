# PROJECT MAP — Entrega da Central Dors para a DOR$

## DESTINATION
Sistema multi-cliente e infraestrutura 100% da DOR$, em contas dela, sem vínculo com o Lucas. Detalhes em PROJECT-SPEC.md.

## FASES

### FASE 0 — Plano e guia de contas [status: concluída em 2026-10-22]
- [x] Inventário do que o sistema usa (código, variáveis da Vercel por nome, `.env` do Deskcomm)
- [x] Guia "Guia das suas contas"
- [x] Plano aprovado pelo Lucas

### FASE 1 — A DOR$ abre as contas [status: aguardando a DOR$]
InboxKit e domínios de envio primeiro (aquecimento de 2 a 3 semanas). Resto em paralelo.
- [ ] Domínio · [ ] VPS HostGator · [ ] Vercel Pro · [ ] Supabase Pro · [ ] Edges · [ ] OpenRouter (2 chaves) · [ ] ElevenLabs · [ ] SerpApi · [ ] InboxKit + chave da API · [ ] Google Cloud · [ ] Google Drive · [ ] GitHub
- **GATE:** todas existem, estão pagas e o Lucas tem acesso. Sem isso, a Fase 2 não começa.

### FASE M — Multi-cliente e backoffice da DOR$ [status: código pronto, na branch local `feat/multi-cliente` (NÃO publicada)]
Baseado no plano arquivado em `docs/arquivo/` (DEC-T1 a T4 seguem valendo).
- [x] WU M.1 Modelo: tabela Cliente; todo dado tem dono; Settings uma linha por cliente; `PanelUser` ligado ao cliente
- [x] WU M.2 Filtro por cliente em ponto central + testes de isolamento
- [~] WU M.3 Integrações por cliente: webhooks do Edges e do Deskcomm acham o cliente; Google por cliente; robô por cliente. Falta confirmar com contas reais: o formato do aviso de integração do Edges e o Deskcomm com uma organização por cliente
- [x] WU M.4 Limites e uso por cliente
- [x] WU M.5 Backoffice da DOR$ (`backoffice/`)
- [x] WU M.6 Rotas `/api/ops/*` para o backoffice
- [x] WU M.7 Migração SQL que leva tudo ao cliente 1 (testada duas vezes com dados de teste e com uma cópia do banco de desenvolvimento). Como não há dado real, a DOR$ começa de banco novo e esta migração só serve a bancos que já tenham dados
- [x] WU M.8 Esquemas separados no mesmo Postgres (`DATABASE_SCHEMA`, `BACKOFFICE_DB_SCHEMA`), conexão direta para migrar (`DIRECT_URL`), robô por cliente em chamadas paralelas
- [x] WU M.9 Exportar e importar o conteúdo de configuração (`scripts/exportar-conteudo.mjs`, `scripts/importar-conteudo.ts`). Exportado em 2026-10-23 (`entrega/conteudo-dors.json`, fora do git, sem citar o Lucas)
- [x] WU M.10 Backoffice completo para operar: WhatsApp (guardar/remover a chave do CRM de cada cliente) e caixas de e-mail (listar, cadastrar com teste, testar, pausar, reativar, aposentar); sem login de suporte do Lucas (OWNER_LOGINS removido); `.env.example` e `vercel.json` (agendador) prontos
- Provado em Postgres local: `scripts/test-isolation.ts`, `scripts/test-clients.ts` (também com `?schema=central`), importação de conteúdo, `next build` do sistema e do backoffice, rodada HTTP com dois clientes, primeiro acesso do backoffice no navegador.
- Falta fora do código: razão social da DOR$ nas páginas legais (e-mail já está).
- **GATE M:** isolamento provado e backoffice criando cliente de ponta a ponta (cumprido em banco local). Falta repetir no Supabase real na Fase 2.

### FASE 2 — Montagem [status: não iniciada; espera o gate da Fase 1]
> Roteiro pronto em `docs/instalacao-dors.md` (passo a passo, variáveis, checklist do ensaio). Modelo do `.env` do Deskcomm em `deploy/deskcomm.env.modelo`; cópia extra em `deploy/COPIA-EXTERNA.md`.
- WU 2.1 VPS: Docker, firewall, usuário, atualizações (só para o Deskcomm)
- WU 2.2 GitHub: transferir `linkedin-auto` e `DeskcommCRM` (privados); gerar a imagem do fork na conta da DOR$
- WU 2.3 Supabase (um projeto, três esquemas) + Deskcomm virgem na VPS (mesmas versões e config, Sentry off, segredos novos)
- WU 2.4 Vercel: projetos `sistema` e `painel`, variáveis, domínios (`app.`, `painel.`), migrações no esquema `central` por `DIRECT_URL`, Vercel Cron a cada 15 min (e sem cron-job.org), `crm.` apontando para a VPS
- WU 2.5 Conteúdo: exportar do banco de desenvolvimento (o Lucas roda), importar no cliente 1 da DOR$; criar o primeiro administrador do backoffice
- WU 2.6 Aviso de aquecimento na tela de caixas ("fase de aquecimento, limite atual X") e limite 30 ao cadastrar caixas
- WU 2.7 Backup: confirmar o do Supabase e, se a DOR$ quiser, a cópia extra no Drive; testar a restauração
- WU 2.8 Ensaio completo com envio desligado (ids de conversa do Edges, aviso de integração, QR do WhatsApp, voz com plano pago, 2 clientes ao mesmo tempo, pooler do Supabase com a Vercel, capacidade do WAHA)

### FASE 3 — Ligar [status: não iniciada]
Não há produção para migrar. A DOR$ conecta LinkedIn (chamada), WhatsApp (QR) e Google; ajusta os avisos do Edges e do Deskcomm para os endereços novos; teste com mensagem real; liga o robô (tira o modo pausado).

### FASE 4 — Depois de ligar [status: não iniciada]
Acompanhar 7 dias · desligar o que era do Lucas (Vercel, Neon, cron-job.org, VPS antiga) · revogar chaves antigas · Lucas sai de todas as contas · documento de entrega (cada conta, custo, renovação, backup).

## CURRENT FRONTIER
- Fase 1: esperar a DOR$ abrir as contas (guia atualizado; falta atualizar o bloco de banco para Supabase único).
- Fase M: pronta e testada em banco local. Nada a fazer até o gate da Fase 1.
- WU 2.6 (aviso de aquecimento e limite 30) feita e testada em 2026-10-23.

## BLOCKED
- FASE 2: espera o gate da Fase 1.
- WU 2.8 (voz): espera um plano pago do ElevenLabs.

## NOT YET SPECIFIED (FOG)
- Nome do domínio, número de caixas e domínios de envio.
- Plano da VPS e do ElevenLabs; preços de Vercel e Supabase (referência).
- Se o Edges mantém os ids de conversa numa conta nova e o que o aviso de integração traz.
- Quem dá manutenção depois e em que formato.
- Validação jurídica de e-mail frio e LGPD.

## OUT OF SCOPE
- Cadastro e pagamento automáticos de clientes, papéis dentro do cliente, banco separado por cliente, segundo fator
- Criação de caixas por API dentro do sistema (futuro)

## INTEGRATION CHECKS
(nenhum ainda; os de conta real ficam na WU 2.8)

## PHASE GATES
- Fase 1 → 2: todas as contas prontas (DEC-14).
- Fase M → 2: isolamento provado e backoffice criando cliente (feito em banco local; repetir no Supabase real).

## LOG DE REPLANEJAMENTO
- 2026-10-15 — Plano multi-cliente criado (arquivado).
- 2026-10-22 — Replanejado: entrega para a DOR$ com infraestrutura própria. Revoga DEC-03.
- 2026-10-23 — Replanejado: a DOR$ terá clientes próprios (Fase M, backoffice separado).
- 2026-10-23 — Replanejado: Vercel + Supabase único (Neon fora); VPS só para o Deskcomm; sem migração de dados porque não há dado real; conteúdo de configuração aproveitado. Fases 2 e 3 simplificadas.
