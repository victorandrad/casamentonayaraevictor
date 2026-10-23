# Site de casamento · Nayara & Victor

Site público + painel dos noivos em microfrontends com **Module Federation** (Rsbuild + React 19 + TypeScript), API em **Node 24 + Fastify** e banco **PostgreSQL 17**, tudo subindo com **Docker Compose**. O design original do Claude Design está em `design/`.

## Estrutura

| App | Porta | Papel | Expõe |
| --- | --- | --- | --- |
| `apps/shell` | 4000 | Host: navegação, capa, contagem, rodapé; monta os remotes; `/painel` abre o painel | — |
| `apps/evento` | 4001 | Cerimônia & recepção, traje, local | `evento/Evento`, `evento/Traje`, `evento/Local` |
| `apps/rsvp` | 4002 | Confirmação de presença, QR Code, check-in e leitor da portaria | `rsvp/Rsvp`, `rsvp/Portaria` |
| `apps/presentes` | 4003 | Lista de presentes, carrinho e checkout (Pix e cartão pelo Stripe) | `presentes/Presentes` |
| `apps/mural` | 4004 | Galeria e recados | `mural/Galeria`, `mural/Recados` |
| `apps/painel` | 4005 | Painel dos noivos (login, convidados, recados, presentes, recebidos, configurações) | `painel/Painel` |
| `apps/api` | 4100 | API REST (Docker) | — |
| Postgres | 5433 | Banco (Docker, volume `db-data`) | — |
| `packages/shared` | — | Tema, ornamentos, dados fixos do casamento, cliente da API, tipos e config de federation | — |

React e React DOM são compartilhados como singleton. Cada remote roda num `RemoteSlot` no shell (Suspense + error boundary): se um remote cair, só aquela seção mostra um aviso.

Os frontends chamam sempre `/api` na própria origem; os dev servers repassam para a API (`API_URL`, padrão `http://localhost:4100`). Em produção, configure o mesmo repasse no proxy reverso, assim o cookie de sessão fica no domínio do site.

## Rodando

```bash
cp .env.example .env        # ajuste as senhas
npm install
npm run docker:up           # sobe Postgres + API (migrations rodam sozinhas)
npm run db:seed             # cria a conta do painel (ADMIN_*) e o conteúdo de exemplo
npm run dev                 # sobe os 6 frontends → http://localhost:4000
```

- Site: http://localhost:4000
- Painel dos noivos: http://localhost:4000/painel (login com `ADMIN_EMAIL` / `ADMIN_PASSWORD` do `.env`)

Outros comandos: `npm run build`, `npm run typecheck`, `npm run lint`, `npm run docker:logs`, `npm run docker:down`, `npm run db:psql`, `npm run dev:api` (API fora do Docker, usando o Postgres do Docker).

### Minha conta e usuários do painel

- **Minha conta** (qualquer usuário): editar o nome e trocar a senha (pede a senha atual; os outros aparelhos conectados saem). Se existir uma caixa de e-mail com o mesmo endereço, ela passa a usar a mesma senha.
- **Usuários do painel** (só o dono, a conta do `ADMIN_EMAIL`): convidar pelo nome e e-mail, reenviar o convite e remover. O convidado recebe um e-mail ("Criar minha senha") com um link de uso único que vale 7 dias (`/painel#definir-senha=…`; no banco fica só o hash do token); ao criar a senha, já entra no painel. Se o e-mail não sair, o painel mostra o link para copiar e mandar por outro meio.
- O `ADMIN_PASSWORD` cria o dono e só é aplicado de novo quando o secret **muda** (guardamos um hash do último valor aplicado), então trocar a senha pelo painel não é desfeito no próximo deploy.

### Contas do painel

O seed cria ou atualiza a conta definida em `ADMIN_EMAIL`, `ADMIN_NOME` e `ADMIN_PASSWORD` (mínimo 10 caracteres). Para dar acesso a mais alguém ou trocar a senha, rode de novo com outros valores:

```bash
docker compose exec -e ADMIN_EMAIL=nayara@exemplo.com -e ADMIN_NOME=Nayara -e ADMIN_PASSWORD='uma-senha-forte' api node src/seed.ts
```

O seed só cria conteúdo de exemplo quando as tabelas estão vazias; nunca apaga nada.

## API

Migrations em `apps/api/migrations/*.sql`, aplicadas em ordem na subida (tabela `schema_migrations`).

| Rota | Acesso | Uso |
| --- | --- | --- |
| `GET /api/public/convites/:codigo` · `PUT …/resposta` | público | RSVP pelo código do convite |
| `GET /api/public/checkin/:codigo` | público | Validação na portaria (QR Code) |
| `GET/POST /api/public/recados` | público | Mural (POST limitado a 5/hora por IP) |
| `GET /api/public/presentes` | público | Categorias, presentes e taxa |
| `POST /api/auth/login` · `logout` · `GET me` | — | Sessão dos noivos |
| `/api/admin/*` | noivos | Resumo, convidados, recados, presentes, configurações |

Segurança: senhas com scrypt; sessão em cookie `HttpOnly` + `SameSite=Lax` (o banco guarda só o hash do token, validade de 30 dias); escritas de outras origens são recusadas (`ALLOWED_ORIGINS`); login limitado a 5 tentativas a cada 15 min. Em produção use HTTPS com `COOKIE_SECURE=true` e senhas fortes no `.env`.

## Pagamento dos presentes (Stripe)

O carrinho da lista de presentes termina no **Stripe Checkout** (página de pagamento hospedada pelo Stripe):

1. O convidado escolhe os presentes, informa nome/e-mail/mensagem e clica em **Pagar**.
2. `POST /api/public/pedidos` grava o pedido **recalculando os valores pelo banco** (o navegador nunca define preço) e cria a Checkout Session.
3. O convidado paga no Stripe e volta para `/?pedido=<session_id>`, onde vê o agradecimento.
4. O webhook `POST /api/stripe/webhook` (assinatura verificada) marca o pedido como **pago**, **aguardando** (métodos que liquidam depois), **falhou** ou **expirado**. Eventos repetidos são ignorados e um pedido pago nunca volta atrás.
5. Os noivos acompanham tudo na aba **Recebidos** do painel.

**Taxa nos preços:** cada presente é cadastrado com o valor que os noivos querem receber; o site e o Stripe cobram esse valor **mais 5,99% + R$ 0,39 por produto** (a taxa do Stripe para cartão internacional, o caso mais caro; ajustável no painel, em Configurações). O preço é calculado de trás para frente — `(valor + fixo) / (1 − percentual)`, arredondado para cima — porque o Stripe aplica o percentual sobre o valor cobrado; assim, mesmo no cartão internacional, sobra exatamente o valor cadastrado. A regra fica em `packages/shared/src/taxas.ts` e é a mesma no site e na API, então o preço mostrado é exatamente o cobrado. O painel mostra no cadastro quanto o convidado vai pagar.

**Presente único × cota:** cada presente tem "Pode ser presenteado": **1 vez** (padrão — depois de pago aparece como *Presenteado ♥* no site), **quantas vezes quiserem** (cotas, ex.: lua de mel) ou uma **quantidade definida**. Enquanto alguém está no pagamento, a unidade fica reservada (sessão do Stripe expira em 30 min); a API confere a disponibilidade dentro de uma transação com trava, então dois convidados não conseguem pagar o mesmo presente único. Se o convidado volta do Stripe sem pagar, o site cancela a sessão e libera o presente na hora.

**Taxas reais:** cada pedido pago guarda a forma de pagamento (cartão e bandeira, Pix…) e a **taxa real cobrada pelo Stripe**, lida da *balance transaction* da cobrança — nada de percentual fixo no código. O painel mostra bruto, taxa e líquido por pedido e um resumo por forma de pagamento. No Pix a taxa fica disponível alguns segundos depois do pagamento; a API tenta de novo sozinha (15 s e 90 s) e a aba Recebidos completa o que faltar ao abrir.

As formas de pagamento são ligadas no [Dashboard do Stripe](https://dashboard.stripe.com/settings/payment_methods), não no código: o Checkout mostra automaticamente o que estiver ativo.

**Pix:** ative "Pix" em *Configurações → Formas de pagamento*. Todos os valores já são em BRL, que é o exigido. O código Pix vale 4 horas (padrão do Stripe); se o convidado não pagar nesse prazo, o pedido fica como *falhou* e nada é cobrado. No Checkout, a sessão do Pix só é concluída quando o pagamento é confirmado, então o pedido costuma ir direto para *pago*.

### Configurando em desenvolvimento (modo de teste)

1. Copie a chave secreta de **teste** (`sk_test_...`) em https://dashboard.stripe.com/test/apikeys para `STRIPE_SECRET_KEY` no `.env`.
2. Suba a Stripe CLI, que repassa os eventos de teste para a API:
   ```bash
   docker compose --profile stripe up -d stripe-cli
   docker compose logs stripe-cli     # copie o "webhook signing secret" (whsec_...)
   ```
3. Coloque o `whsec_...` em `STRIPE_WEBHOOK_SECRET` no `.env` e recrie a API: `docker compose up -d api`.
4. Teste os pagamentos:
   - **Cartão:** `4242 4242 4242 4242`, qualquer validade futura e CVC.
   - **Pix:** escolha Pix, use o CPF de teste `000.000.000-00` e clique em *Simular digitalização* para aprovar ou expirar. O e-mail do convidado controla a simulação: `qualquer+succeed_immediately@exemplo.com` confirma na hora, `qualquer+expire_immediately@exemplo.com` expira, e um e-mail comum confirma depois de ~3 minutos.

### Produção

Use a chave **live** e crie no Dashboard um endpoint de webhook apontando para `https://casamentonayaraevictor.com.br/api/stripe/webhook` com os eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` e `checkout.session.expired`; o `whsec_...` desse endpoint vai em `STRIPE_WEBHOOK_SECRET`.

## Galeria de fotos

A seção "Nossa história em fotos" do site lê as fotos da API (`GET /api/public/galeria`). No painel, aba **Galeria**: **Enviar fotos** (várias de uma vez, com o momento: Nós dois, O pedido, Viagens, Família ou O casamento), editar legenda, momento e a própria imagem, excluir e reordenar arrastando (no celular, toque e segure). As imagens passam pelo mesmo upload das fotos dos presentes, mas guardadas com até 2000 px, porque abrem em tela cheia; ao excluir ou trocar uma foto, o arquivo antigo é apagado. No site, os filtros mostram só os momentos que têm fotos; sem nenhuma, aparece "Em breve, nossas fotos".

## Fotos dos presentes

No painel, cada presente tem um campo de **upload de foto** (JPG, PNG, WebP ou HEIC, até 10 MB). A API (`POST /api/admin/uploads`) re-codifica toda imagem com `sharp` — reduz para no máximo 1200px, converte para WebP e remove metadados como GPS — e guarda no volume Docker `uploads-data` (`/app/uploads`), servindo em `/api/uploads/<arquivo>.webp` com cache longo. Ao trocar a foto ou remover o presente, o arquivo antigo é apagado. Para backup, inclua esse volume junto com o do banco.

## E-mail: recibo do presente

Quando um presente é pago, a API envia ao convidado um **recibo por e-mail** (itens, total pago, data, forma de pagamento, número do pedido e a mensagem dele), no visual do site. O envio acontece **uma única vez** por pedido (o banco marca `recibo_enviado_em`; se o envio falhar, a marca é desfeita para tentar de novo) e o painel, na aba **Recebidos**, mostra o status e tem o botão **Reenviar recibo**.

O envio é por **SMTP** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`), com o remetente em `EMAIL_FROM` e `EMAIL_REPLY_TO`. Em produção o SMTP é o servidor de e-mail do próprio projeto (abaixo), sem nada para configurar.

### Desenvolvimento: Mailpit

O `docker compose up -d` sobe o **Mailpit**, um servidor de e-mail local que recebe tudo o que a API envia e mostra numa caixa de entrada em **http://localhost:8025**. Nada sai da sua máquina.

### Produção: servidor de e-mail próprio (`@casamentonayaraevictor.com.br`)

O VPS roda um servidor de e-mail completo para o domínio, que **envia e recebe**:

- **mailserver** ([docker-mailserver](https://docker-mailserver.github.io/docker-mailserver/latest/) 16: Postfix + Dovecot + Rspamd com DKIM). Portas 25 (receber), 465/587 (enviar com login) e 993 (IMAP), só em IPv4. O certificado é o que o Traefik emite para `mail.casamentonayaraevictor.com.br`, lido do `acme.json` dele.
- **webmail** (Roundcube) em **https://mail.casamentonayaraevictor.com.br**.
- **Caixas e apelidos no painel**, aba **E-mails**: criar e excluir caixas, trocar senha, criar apelidos (ex.: `presentes@` entregando em `contato@` ou num Gmail). A API grava `postfix-accounts.cf` (senhas em `{SHA512-CRYPT}`) e `postfix-virtual.cf` no volume de configuração que divide com o mailserver, que recarrega sozinho em poucos segundos.
- **Caixa do login do painel**: a caixa com o mesmo endereço do `ADMIN_EMAIL` (ex.: `contato@`) usa a mesma senha do login. O seed cria a caixa e a atualiza quando o `ADMIN_PASSWORD` muda; trocar a senha em "Minha conta" também atualiza a caixa. Na aba E-mails ela aparece como "Login do painel", sem "Trocar senha" nem "Excluir".
- O docker-mailserver só sobe com pelo menos uma caixa: a primeira foi `postmaster@` (senha aleatória gerada no servidor; troque pelo painel se quiser usá-la). Ela recebe os avisos de outros servidores.
- **fail2ban**: os logins do webmail chegam do container do Roundcube, então a rede interna do projeto fica fora dos bloqueios (senão poucas senhas erradas travariam o webmail de todos por uma semana). Fica em `fail2ban-jail.cf` no volume de configuração do mailserver (`[DEFAULT]` `ignoreip = 127.0.0.1/8 <sub-rede de casamento-nv_default>`) e só vale depois de recriar o container (`up -d --force-recreate mailserver`). As portas 993/587/465 continuam protegidas.
- Os **recibos** saem pela porta 25 interna, sem login (o mailserver confia só na rede do projeto, `PERMIT_DOCKER=connected-networks`). Remetente: `EMAIL_FROM` (`presentes@…`); crie o apelido `presentes@` para as respostas chegarem numa caixa.

DNS (Registro.br) e servidor:

| Registro | Nome | Valor |
| --- | --- | --- |
| A | `mail` | `177.7.36.12` |
| MX | (domínio) | `mail.casamentonayaraevictor.com.br` (prioridade 10) |
| TXT (SPF) | (domínio) | `v=spf1 mx -all` |
| TXT (DKIM) | `mail._domainkey` | chave gerada com `docker compose -f compose.yaml -f compose.producao.yaml exec mailserver setup config dkim domain casamentonayaraevictor.com.br` |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=quarantine; adkim=s; aspf=s` |
| PTR (reverso) | `177.7.36.12` | `mail.casamentonayaraevictor.com.br` (hPanel → VPS → Configurações → DNS reverso) |

No celular ou no Outlook/Thunderbird: conta IMAP, usuário = endereço completo, entrada `mail.casamentonayaraevictor.com.br` porta 993 SSL/TLS, saída no mesmo endereço, porta 587 STARTTLS. Teste a reputação em https://www.mail-tester.com antes do casamento.

Localmente o mailserver e o webmail ficam no perfil `email` (`docker compose --profile email up -d mailserver webmail`, webmail em http://localhost:8089, domínio `casamento.localhost`).

## Deploy (GitHub Actions → VPS)

Mesmo fluxo do temagua.app: produção em **https://casamentonayaraevictor.com.br**, no VPS da Hostinger, atrás do Traefik do servidor (HTTPS automático). Tudo fica no mesmo domínio:

| Caminho | Serviço |
| --- | --- |
| `/` | shell (qualquer rota, como `/painel`, cai no `index.html`) |
| `/mf/<app>/` | cada microfrontend (`evento`, `rsvp`, `presentes`, `mural`, `painel`) |
| `/api/*` | API (container `api`) |

### Pipelines

Dois workflows, cada um disparado só quando a sua parte muda na `main` (ou à mão, em *Actions → Run workflow*):

- **Backend** ([backend.yml](.github/workflows/backend.yml)): API → imagem `ghcr.io/victorandrad/casamento-api`.
- **Frontend** ([frontend.yml](.github/workflows/frontend.yml)): shell e microfrontends → imagem `ghcr.io/victorandrad/casamento-web`.

```
install ── security ── code-analyzing ── build-app ── build-image ── deploy
npm ci     osv-scanning  linting         build-app:   build-image:   deploy:producao
           report-…      typecheck       producao     producao
                         sonarqube-check
```

Cada etapa é um workflow reutilizável (`etapa-*.yml`):

| Etapa | O que faz |
| --- | --- |
| install | `npm ci` e `node_modules` em cache (as outras etapas só restauram, com [.github/actions/dependencias](.github/actions/dependencias/action.yml)) |
| security | OSV-Scanner no `package-lock.json`: resultado em *Security → Code scanning* e issues `segurança` por parte, que fecham sozinhas quando a vulnerabilidade some ([issues-seguranca.mjs](.github/scripts/issues-seguranca.mjs)). Não bloqueia o deploy |
| code-analyzing | ESLint (`npm run lint:backend` / `lint:frontend`), TypeScript (`typecheck:backend` / `typecheck:frontend`) e um SonarQube temporário que vira issues `sonarqube` ([issues-sonarqube.mjs](.github/scripts/issues-sonarqube.mjs)); o SonarQube não bloqueia |
| build-app | frontend: `npm run build:frontend` com as URLs de produção, e os `dist` vão como artefato; backend: a API sobe contra um PostgreSQL (com as migrations) e precisa responder |
| build-image | publica a imagem no GitHub Container Registry com a tag do commit e `latest` ([docker/api.Dockerfile](docker/api.Dockerfile), [docker/web.dist.Dockerfile](docker/web.dist.Dockerfile)) |
| deploy | SSH no VPS ([deploy-vps.yml](.github/workflows/deploy-vps.yml)): a chave só pode rodar o `casamento-deploy`, que baixa a imagem daquele commit e troca só aquele container; depois confere a home e `/api/health` ou o manifest de um microfrontend. Sem o secret `VPS_SSH_KEY`, é pulado com um aviso |

O VPS não tem o código nem compila nada: em `/opt/casamento` ficam só o `.env` (domínio e banco), o `segredos.env` (gravado pelo deploy), o [compose.yaml](compose.yaml) e o [compose.producao.yaml](compose.producao.yaml) (que o deploy atualiza a cada commit).

### Secrets e variables do GitHub

Em *Settings → Secrets and variables → Actions*. A cada deploy o job manda os preenchidos pelo SSH e o `casamento-deploy` grava em `/opt/casamento/segredos.env` (permissão 600, só os nomes abaixo são aceitos, valores usados como estão). Se algo mudou, a API é recriada e o seed cria/atualiza o login do painel.

| Tipo | Nome | Para quê |
| --- | --- | --- |
| Secret | `VPS_SSH_KEY` | chave do deploy (presa ao `casamento-deploy`) |
| Secret | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | dono do painel (senha com 10+ caracteres, aplicada só quando o secret muda); também a caixa de e-mail com esse endereço |
| Secret | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe em modo real (`sk_live_…`, `whsec_…`) |
| Variable | `ADMIN_NOME`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | nome no painel e remetente dos recibos |

Mudou um valor? Rode *Actions → Backend → Run workflow* (ou espere o próximo push) para ele chegar ao servidor. O Nginx da imagem web ([docker/nginx.conf](docker/nginx.conf)) serve os arquivos e repassa `/api` para a API.

### Preparar o servidor (uma vez)

1. **DNS:** registros `A` de `casamentonayaraevictor.com.br` e `www` apontando para `177.7.36.12`.
2. **Pasta:** crie `/opt/casamento/.env` a partir de [docker/.env.producao.example](docker/.env.producao.example) (domínio e senha do banco, gerada com `openssl rand -hex 24`). Login, Stripe e remetente vêm dos secrets/variables do GitHub.
3. **Script de deploy:** copie [docker/deploy-vps.sh](docker/deploy-vps.sh) para `/usr/local/bin/casamento-deploy` (`chmod 755`).
4. **Chave do GitHub Actions**, só para este projeto:
   ```bash
   ssh-keygen -t ed25519 -f casamento-deploy -C github-actions-deploy@casamento -N ""
   ```
   No servidor, adicione a pública em `/root/.ssh/authorized_keys` presa ao script:
   ```
   restrict,command="/usr/local/bin/casamento-deploy" ssh-ed25519 AAAA... github-actions-deploy@casamento
   ```
   No GitHub, a privada vai no secret `VPS_SSH_KEY` (*Settings → Secrets and variables → Actions*). Crie também o ambiente `producao` em *Settings → Environments*. A chave aparece em *hPanel → VPS → Chaves SSH* como `… github-actions-deploy@casamento`, igual à do temagua.
5. **Banco:** suba o Postgres uma vez (`cd /opt/casamento && docker compose -f compose.yaml -f compose.producao.yaml up -d --wait db`); os deploys de cada parte trocam só a API ou o site (`--no-deps`). O Traefik do servidor (`traefik-duis-traefik-1`) roda em rede `host` e acha o container `web` pelos labels, sem precisar ligar redes.
6. **Conta do painel:** preencha os secrets `ADMIN_EMAIL` e `ADMIN_PASSWORD`; o deploy roda o seed sozinho (em produção ele só cria/atualiza o login, sem conteúdo de exemplo).
7. **Stripe:** crie o webhook `https://casamentonayaraevictor.com.br/api/stripe/webhook` (modo live, eventos na seção do Stripe acima) e coloque a chave e o `whsec_...` nos secrets `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`.

**Voltar uma versão:** no servidor, `casamento-deploy backend <commit>` ou `casamento-deploy frontend <commit>` com o SHA de um commit já publicado.

**Backup do banco:** `docker compose -f compose.yaml -f compose.producao.yaml exec -T db pg_dump -U casamento casamento > backup.sql`. As fotos ficam no volume `casamento-nv_uploads-data`.

**Site completo localmente** (igual à produção, com Nginx): `docker compose --profile site up -d --build` → http://localhost:8088.

## Links especiais

- `#convite=NV-A1B2`: abre o RSVP já com o convite identificado (o painel copia esse link e monta a mensagem de WhatsApp).
- **QR Code do convite impresso:** no painel, cada convidado tem o botão **QR Code** (baixar PNG em alta ou imprimir) e a aba Convidados tem **Imprimir QR Codes**, uma folha A4 com QR, nome e código de todos os convites filtrados. O QR abre `/#convite=CÓDIGO`; no site, o convidado também pode tocar em **Ler QR Code do convite** (câmera) ou digitar o código.
- `#checkin=NV-A1B2`: tela de validação que o QR Code da confirmação (mostrado após o RSVP) abre na portaria.
- `#scanner`: leitor de QR da portaria (câmera do celular).

## Pendências

- Stripe: falta informar as chaves (teste e depois produção) e ativar as formas de pagamento desejadas no Dashboard.
- Deploy: pipelines prontos; falta preparar o servidor e cadastrar o secret `VPS_SSH_KEY` (seção Deploy).
