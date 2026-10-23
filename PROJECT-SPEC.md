# PROJECT SPEC — Entrega da Central Dors para a DOR$ (infraestrutura própria, multi-cliente)

> Substitui o plano multi-cliente de 2026-10-15 (cópia em `docs/arquivo/`). Atualizado em 2026-10-23.

## DESTINATION
A DOR$ passa a ser dona de todo o sistema: código, hospedagem, banco, contas das ferramentas e custos. Nada fica em nome do Lucas. O Lucas só dá suporte técnico se e quando a DOR$ quiser, sem obrigação. A DOR$ usa o sistema para os clientes dela.

## PROBLEMA E OBJETIVO
Hoje tudo roda em contas do Lucas (Vercel, Neon, Edges, caixas do InboxKit, VPS HostGator com o Deskcomm, domínios, chaves de IA e voz) e **não há dado real em produção**: o projeto ainda não começou a ser usado de verdade. Objetivo: instalar o sistema, já multi-cliente, em contas novas da DOR$, com o conteúdo de configuração que já existe (campanhas, manual da assistente, ajustes), e ligá-lo sem migrar dados.

## USUÁRIOS
- **DOR$ (dona e administradora geral):** abre e paga as contas, compra os domínios. Usa o **backoffice** para criar e gerenciar os clientes dela. É também o cliente 1 do sistema (conecta o próprio LinkedIn e WhatsApp).
- **Clientes da DOR$:** cada um com suas pessoas, login próprio, e só vê os próprios dados. Não vê nada técnico.
- **Lucas:** monta e entrega. Depois sai de todas as contas.

## MULTI-CLIENTE
Um sistema único, todos os clientes na mesma base com isolamento forte (reaproveita `docs/arquivo/PROJECT-SPEC-multicliente-2026-10-15.md`: DEC-01, 02, 04, 05, 07 e DEC-T1 a T4; a DEC-03 segue revogada, quem arca com as ferramentas é a DOR$). Cada cliente tem sua identidade do LinkedIn (Edges), seu canal de WhatsApp (Deskcomm), seu Google, suas caixas e seu uso medido. Implementado (Fase M): dono em todo dado, filtro central em `src/lib/prisma.ts`, sessão com o cliente no cookie, robô e webhooks por cliente, rotas `/api/ops`.

## BACKOFFICE DA DOR$ (DEC-16)
App **separado** do sistema (`backoffice/`), sem rota `/admin` dentro dele. Projeto próprio na Vercel, domínio próprio (`painel.`), login próprio (e-mail e senha; segundo fator fora do primeiro corte, decisão do Lucas em 2026-10-23), não aparece em nenhum link do sistema dos clientes.
- **Funções:** criar/pausar/reativar cliente; escolher plano e limites; convidar e remover pessoas do cliente; ver uso e saúde por cliente; "rodar o robô agora"; administradores; registro de quem fez o quê.
- **Como fala com o sistema:** só pelas rotas `/api/ops/*` do sistema (segredo `OPS_SECRET`), nunca escrevendo no banco do sistema. O backoffice não conhece o `SESSION_SECRET` e um erro dele não corrompe dados dos clientes.
- **Base própria:** administradores e registro ficam no esquema `backoffice` do mesmo Postgres.
- **"Entrar como cliente":** fora do primeiro corte.

## FLUXOS PRINCIPAIS
1. A DOR$ abre as contas seguindo o guia (artefato "Guia das suas contas", 13 contas). InboxKit e domínios de envio primeiro (aquecimento de 2 a 3 semanas).
2. Gate: todas as contas existem, estão pagas e o Lucas tem acesso.
3. Lucas monta tudo (Vercel, Supabase, VPS do Deskcomm), importa o conteúdo e ensaia com o envio desligado.
4. A DOR$ conecta LinkedIn, WhatsApp e Google; teste com mensagem real; liga o robô.
5. Acompanhamento de 7 dias, desligamento do que era do Lucas, revogação das chaves antigas e documento de entrega.

## ARQUITETURA ALVO (DEC-17)
- **Vercel Pro, time da DOR$:** dois projetos, `sistema` (app.) e `painel` (backoffice). O robô é o Vercel Cron (a cada 15 min) em `/api/cron/poll`; com mais de um cliente, cada um roda numa chamada à parte (cada uma com o próprio limite de tempo).
- **Supabase Pro, organização da DOR$, um projeto com três esquemas:** `public` (Deskcomm, como ele vem), `central` (o sistema, `DATABASE_SCHEMA=central`) e `backoffice` (`BACKOFFICE_DB_SCHEMA=backoffice`). Sistema e backoffice usam o pooler (`DATABASE_URL`); migrações usam a conexão direta (`DIRECT_URL`). O Neon sai. **Premissa a confirmar com o Supabase real**: o pooler com a Vercel e as migrações no esquema `central`; localmente tudo passou num Postgres com `?schema=central`.
- **VPS HostGator da DOR$ (mín. 2 CPU, 4 GB, 100 GB, Ubuntu), só para o WhatsApp:** Deskcomm "virgem" (caddy, app, waha, redis, srh, scheduler, worker) com a mesma versão e configuração de hoje. Fork `lucasprestestec/DeskcommCRM` (26 mudanças sobre o oficial, necessárias ao app: QR, trocar número, histórico com mídia, provisionamento), imagem gerada no GitHub da DOR$. Worker, scheduler e voz em 1.69.0, WAHA `latest-2026.7.2`, engine NOWEB, voz/telefonia desligadas, Sentry `off`. Uma organização do Deskcomm por cliente.
- **Backup:** automático do Supabase + cópia extra diária no Google Drive da DOR$ (opcional, feita a partir da VPS).

## CONTAS A ABRIR PELA DOR$ (todas no nome e cartão dela)
Domínio (Registro.br) · VPS HostGator · Vercel Pro · Supabase Pro · Edges · OpenRouter (2 chaves: sistema e CRM) · ElevenLabs (plano pago, Starter ou acima) · SerpApi · InboxKit (+ chave da API) · Google Cloud (OAuth Gmail e Agenda) · Google Drive · GitHub.
Fora: Neon, cron-job.org, Fish Audio (só o ElevenLabs), Resend, OpenAI e Sentry. Endereços: `app.`, `painel.`, `crm.` e `links.` no domínio da DOR$.

## REGRAS DE NEGÓCIO
- E-mail de envio: caixas novas do InboxKit, em domínios secundários comprados pela DOR$. **Sem ponte com as caixas do Lucas.**
- Capacidade de referência: **30 e-mails/dia por caixa** (≈ 660/mês em 22 dias úteis), 2 a 3 caixas por domínio (limite do InboxKit: 5). Cada caixa custa US$ 3/mês.
- Aquecimento: a caixa começa em 5/dia e sobe 1/dia até o limite (chega a 30 no 26º dia). Não impede enviar: só limita ao recomendado. O sistema deve avisar na tela ("fase de aquecimento, limite atual X") — ainda não existe (WU 2.6).
- Novas caixas: compra manual no InboxKit e cadastro no sistema; a criação por API é futura.

## DADOS (DEC-18)
- **Não há migração de dados**: o banco é novo e o cliente 1 (DOR$) nasce vazio. Segredos todos novos (`SESSION_SECRET` inclusive): não há nada cifrado para preservar.
- **Conteúdo aproveitado** do banco de desenvolvimento do Lucas: campanhas, cadência, manual da assistente e ajustes, por `scripts/exportar-conteudo.mjs` e `scripts/importar-conteudo.ts`. Não vão: contatos, mensagens, o login `lucas`, a caixa `helena@oficialweb.shop`, conexões (LinkedIn, WhatsApp, Google), voz da Fish, plano. O formulário público das campanhas fica desligado.
- A migração SQL `20261023100000_multi_cliente` continua valendo para qualquer banco que já tenha dados (converte tudo para o cliente 1).

## INTEGRAÇÕES
Edges (LinkedIn, uma identidade por cliente; o aviso de integração é achado pela identidade — formato a confirmar), Deskcomm (WhatsApp, QR novo, uma organização por cliente), Google (OAuth novo, o cliente reconecta), IA via OpenRouter (`NOUS_BASE_URL`), voz ElevenLabs (vozes prontas e gravação da própria voz, não testada com plano pago), busca SerpApi, InboxKit (caixas e API).

## SEGURANÇA
Segredos nunca no chat, em commit ou em log. Sentry do CRM desligado. Repositórios privados na transferência (hoje `linkedin-auto` e `DeskcommCRM` estão públicos). Todos os segredos novos gerados do zero. Páginas legais com o contato da DOR$ (`administrativo@dorsplanejamento.com.br`); razão social a confirmar.

## REQUISITOS NÃO FUNCIONAIS
A produção atual do Lucas não é tocada até a DOR$ estar no ar. Ensaio com envio desligado. Nada da branch `feat/multi-cliente` vai para a Vercel do Lucas (a migração exige banco novo ou backup).

## CRITÉRIOS DE ACEITE
- Todas as contas no nome da DOR$ e nenhuma em nome do Lucas.
- Sistema com LinkedIn, WhatsApp, e-mail, voz e agenda funcionando para pelo menos 2 clientes de teste ao mesmo tempo, sem um ver o outro.
- Cópia de segurança restaurada em teste.
- Chaves antigas revogadas.
- Documento de entrega com cada conta, custo e como renovar.

## DECISÕES DO USUÁRIO
- DEC-08 (2026-10-22) Tudo da DOR$ vai para contas dela; nada fica com o Lucas. Suporte opcional. **Revoga a DEC-03**.
- DEC-09 VPS nova na HostGator, da DOR$; a VPS atual do Lucas não passa. (Desde DEC-17, só para o Deskcomm.)
- DEC-10 Deskcomm virgem, igual ao atual (fork), com Supabase novo da DOR$. Sem transferir o Supabase atual.
- DEC-11 Só ElevenLabs para voz, com gravação da própria voz.
- DEC-12 Caixas novas e domínios comprados pela DOR$; sem ponte com caixas do Lucas; limite 30/dia por caixa; aviso de aquecimento na tela.
- DEC-13 Sentry off; só o Gmail do app; repositórios privados na transferência.
- DEC-14 A montagem só começa quando TODAS as contas estiverem prontas.
- DEC-15 (2026-10-23) Multi-cliente: a DOR$ terá clientes; desenvolvido numa cópia, sem tocar na produção.
- DEC-16 (2026-10-23) Backoffice da DOR$ como app separado, sem rota `/admin`; sem segundo fator por ora.
- DEC-17 (2026-10-23) Vercel + Supabase único (esquemas separados); VPS só para o Deskcomm; Neon e cron-job.org fora. Motivo: menos manutenção para quem não é técnico e uma conta de banco a menos.
- DEC-18 (2026-10-23) Sem migração de dados (não há dado real); aproveitar todo o conteúdo de configuração que existe.

## RISCOS
- **Vazamento de dados entre clientes (o maior):** filtro central + testes de isolamento em toda entrega; avaliar trava extra no banco (RLS).
- Supabase único com Vercel (pooler, esquemas, limites de conexão) não testado em conta real.
- Revenda: termos de Edges, Deskcomm (MIT, ok), InboxKit, ElevenLabs e OpenRouter não conferidos; agora é risco da DOR$.
- Capacidade: um WhatsApp por cliente = uma sessão WAHA; a VPS de 4 GB pode não aguentar muitos clientes.
- Custo por cliente (Edges ~US$ 8, caixas US$ 3 cada, IA, voz) acima do preço do plano da DOR$.
- Backoffice com acesso a todos os clientes e sem segundo fator: login fraco expõe todos; mitigação: domínio separado, limite de tentativas, registro de ações.
- Aviso de integração do Edges pode não trazer a identidade (então o aviso de "sessão caiu" é ignorado).
- Deskcomm novo, imagem do fork e instalação na VPS ainda não testados.
- Spam: o teste de entrega anterior caiu no spam do Gmail em 2 de 2.
- Sem suporte obrigatório: a VPS do Deskcomm fica sem dono se a DOR$ não contratar.
- LGPD e e-mail frio: validação jurídica pendente.

## FORA DE ESCOPO
Cadastro e pagamento automáticos de clientes, papéis dentro do cliente, banco separado por cliente, criação de caixas por API dentro do sistema, painel de custos, segundo fator.

## PENDÊNCIAS
- Planos, preços e limites dos clientes da DOR$ e o que acontece ao atingir o limite.
- Quantos clientes a DOR$ espera (define a VPS do Deskcomm).
- Razão social da DOR$ para as páginas legais.
- Nome do domínio da DOR$ e quantas caixas/domínios de envio.
- Plano exato da VPS e do ElevenLabs; preços de Vercel e Supabase (referência, conferir na tela).
- Quem faz a manutenção depois (Lucas, opcional).
