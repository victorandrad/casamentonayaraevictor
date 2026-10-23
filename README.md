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

Outros comandos: `npm run build`, `npm run typecheck`, `npm run docker:logs`, `npm run docker:down`, `npm run db:psql`, `npm run dev:api` (API fora do Docker, usando o Postgres do Docker).

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

## Fotos dos presentes

No painel, cada presente tem um campo de **upload de foto** (JPG, PNG, WebP ou HEIC, até 10 MB). A API (`POST /api/admin/uploads`) re-codifica toda imagem com `sharp` — reduz para no máximo 1200px, converte para WebP e remove metadados como GPS — e guarda no volume Docker `uploads-data` (`/app/uploads`), servindo em `/api/uploads/<arquivo>.webp` com cache longo. Ao trocar a foto ou remover o presente, o arquivo antigo é apagado. Para backup, inclua esse volume junto com o do banco.

## E-mail: recibo do presente

Quando um presente é pago, a API envia ao convidado um **recibo por e-mail** (itens, total pago, data, forma de pagamento, número do pedido e a mensagem dele), no visual do site. O envio acontece **uma única vez** por pedido (o banco marca `recibo_enviado_em`; se o envio falhar, a marca é desfeita para tentar de novo) e o painel, na aba **Recebidos**, mostra o status e tem o botão **Reenviar recibo**.

O envio é por **SMTP**, configurado pelas variáveis `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` e `EMAIL_REPLY_TO`.

### Desenvolvimento: Mailpit

O `docker compose up -d` sobe o **Mailpit**, um servidor de e-mail local que recebe tudo o que a API envia e mostra numa caixa de entrada em **http://localhost:8025**. Nada sai da sua máquina.

### Produção: servidor de e-mail próprio

O `docker-compose.yml` traz o serviço `mailserver` ([docker-mailserver](https://docker-mailserver.github.io/docker-mailserver/latest/): Postfix + Dovecot + Rspamd com DKIM), desligado por padrão (perfil `email`). Para ele entregar na caixa de entrada (e não no spam) é preciso:

1. **Um VPS com IP fixo e a porta 25 liberada** (muitos provedores bloqueiam a 25 por padrão e liberam sob pedido; internet residencial não serve).
2. **DNS do domínio**:
   - `A` `mail.seudominio` → IP do servidor, e `MX` do domínio → `mail.seudominio`;
   - **PTR (DNS reverso)** do IP → `mail.seudominio` (configurado no painel do provedor do VPS);
   - **SPF**: `TXT` `v=spf1 mx -all`;
   - **DKIM**: gere a chave com `docker compose exec mailserver setup config dkim` e publique o `TXT` indicado;
   - **DMARC**: `TXT` em `_dmarc` com `v=DMARC1; p=quarantine; rua=mailto:...`.
3. **Certificado TLS** (Let's Encrypt para `mail.seudominio`).
4. Subir e criar a conta que envia:
   ```bash
   docker compose --profile email up -d mailserver
   docker compose exec mailserver setup email add presentes@seudominio 'uma-senha-forte'
   ```
5. No `.env`: `SMTP_HOST=mailserver`, `SMTP_PORT=587`, `SMTP_SECURE=false` (usa STARTTLS), `SMTP_USER=presentes@seudominio`, `SMTP_PASS=...`, `EMAIL_FROM="Nayara & Victor <presentes@seudominio>"`; depois `docker compose up -d api`.

Teste a reputação em https://www.mail-tester.com antes do casamento. Se preferir não manter um servidor de e-mail, as mesmas variáveis SMTP funcionam com qualquer provedor (Amazon SES, Brevo, Zoho, Google Workspace…).

## Deploy (GitHub Actions → VPS)

Produção: **https://casamentonayaraevictor.com.br**, num servidor Linux com Docker. Tudo fica no mesmo domínio:

| Caminho | Serviço |
| --- | --- |
| `/` | shell (qualquer rota, como `/painel`, cai no `index.html`) |
| `/mf/<app>/` | cada microfrontend (`evento`, `rsvp`, `presentes`, `mural`, `painel`) |
| `/api/*` | API (container `api`) |

Arquivos:
- [.github/workflows/ci.yml](.github/workflows/ci.yml): a cada pull request ou push fora da `main`, instala, roda o typecheck e o build.
- [.github/workflows/deploy.yml](.github/workflows/deploy.yml): a cada push na `main`, roda o CI, monta as imagens `-api` e `-web`, publica no GitHub Container Registry (`ghcr.io/<dono>/<repo>-api|web`, com a tag do commit), envia o compose para o servidor por SSH, atualiza os containers e confere `/api/health`, `/` e um manifest de microfrontend.
- [deploy/web.Dockerfile](deploy/web.Dockerfile): faz o build do shell e dos remotes já com as URLs de produção (`MF_*_URL`) e serve tudo com o Caddy.
- [deploy/Caddyfile](deploy/Caddyfile): HTTPS automático (Let's Encrypt), `www` → domínio principal, cache longo para arquivos com hash e `no-cache` para HTML e manifests, cabeçalhos de segurança.
- [deploy/docker-compose.prod.yml](deploy/docker-compose.prod.yml): `db` (Postgres, sem porta exposta), `api` e `web` (portas 80 e 443).
- [deploy/.env.production.example](deploy/.env.production.example): modelo do `.env` do servidor.

### Preparar o servidor (uma vez)

1. **DNS:** registros `A` de `casamentonayaraevictor.com.br` e `www` apontando para o IP do servidor (e `AAAA` se houver IPv6).
2. **Docker:** instale o Docker Engine com o plugin compose (`curl -fsSL https://get.docker.com | sh`). Libere as portas 80 e 443 no firewall.
3. **Usuário de deploy:** crie um usuário (ex.: `deploy`) no grupo `docker` e gere um par de chaves só para o GitHub:
   ```bash
   ssh-keygen -t ed25519 -f deploy_casamento -C github-actions -N ""
   ```
   Coloque `deploy_casamento.pub` em `~deploy/.ssh/authorized_keys` no servidor.
4. **Pasta e segredos:** crie `/opt/casamento` (dono `deploy`) e copie `deploy/.env.production.example` para `/opt/casamento/.env`, preenchendo senha do banco, conta do painel, Stripe **live**, SMTP e `ACME_EMAIL`. Esse arquivo só existe no servidor.

### Configurar o GitHub (uma vez)

Em *Settings → Secrets and variables → Actions*:

| Tipo | Nome | Valor |
| --- | --- | --- |
| Secret | `VPS_HOST` | IP ou nome do servidor |
| Secret | `VPS_USER` | `deploy` |
| Secret | `VPS_SSH_KEY` | conteúdo da chave privada `deploy_casamento` |
| Secret | `VPS_KNOWN_HOSTS` | saída de `ssh-keyscan -H IP_DO_SERVIDOR` |
| Variable (opcional) | `VPS_PORT` | porta SSH, se não for 22 |
| Variable (opcional) | `DEPLOY_PATH` | pasta no servidor, se não for `/opt/casamento` |

Em *Settings → Environments*, crie o ambiente `production` (dá para exigir aprovação antes de cada deploy). As imagens usam o `GITHUB_TOKEN` do próprio workflow, sem token extra.

### Primeiro deploy

1. Faça push na `main` (ou rode *Actions → Deploy → Run workflow*).
2. Crie a conta do painel no servidor:
   ```bash
   cd /opt/casamento && docker compose -f docker-compose.prod.yml --env-file .env --env-file imagens.env exec api node src/seed.ts
   ```
   Em produção o seed só cria/atualiza o login; não cadastra conteúdo de exemplo.
3. No Stripe (modo live), crie o webhook `https://casamentonayaraevictor.com.br/api/stripe/webhook` (eventos na seção do Stripe acima), coloque o `whsec_...` em `STRIPE_WEBHOOK_SECRET` no `.env` do servidor e rode o deploy de novo.

**Voltar uma versão:** *Actions → Deploy → Run workflow* com o SHA de um commit já publicado no campo `versao`; as imagens daquele commit são reaproveitadas.

**Backup do banco:** `docker compose -f docker-compose.prod.yml --env-file .env --env-file imagens.env exec -T db pg_dump -U casamento casamento > backup.sql`. As fotos ficam no volume `casamento-nv_uploads-data`.

## Links especiais

- `#convite=NV-A1B2`: abre o RSVP já com o convite identificado (o painel copia esse link e monta a mensagem de WhatsApp).
- **QR Code do convite impresso:** no painel, cada convidado tem o botão **QR Code** (baixar PNG em alta ou imprimir) e a aba Convidados tem **Imprimir QR Codes**, uma folha A4 com QR, nome e código de todos os convites filtrados. O QR abre `/#convite=CÓDIGO`; no site, o convidado também pode tocar em **Ler QR Code do convite** (câmera) ou digitar o código.
- `#checkin=NV-A1B2`: tela de validação que o QR Code da confirmação (mostrado após o RSVP) abre na portaria.
- `#scanner`: leitor de QR da portaria (câmera do celular).

## Pendências

- Fotos da galeria ainda são placeholders (as dos presentes já são enviadas pelo painel).
- Stripe: falta informar as chaves (teste e depois produção) e ativar as formas de pagamento desejadas no Dashboard.
- Deploy: workflows prontos; falta subir o repositório no GitHub, preparar o servidor e cadastrar os segredos (seção Deploy).
