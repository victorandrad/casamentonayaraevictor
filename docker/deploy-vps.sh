#!/bin/sh
# Deploy do site do casamento no VPS: baixa a imagem já construída no CI (registro do GitHub) e troca
# o container. O VPS não compila nada.
#
#   backend  <commit>  → api  (ghcr.io/victorandrad/casamento-api:<commit>)   workflow "Backend"
#   frontend <commit>  → web  (ghcr.io/victorandrad/casamento-web:<commit>)   workflow "Frontend"
#   tudo     [commit]  → api + web (+ db, mailserver, webmail)                 à mão
#
# O VPS não guarda o código (nada de git clone): /opt/casamento tem só .env, compose.yaml e
# compose.producao.yaml (+ segredos.env, gravado aqui). Pela entrada padrão o workflow manda três linhas:
#   1. o token do registro (o GITHUB_TOKEN do job, que expira no fim dele);
#   2. os dois arquivos de compose do commit publicado (tar.gz em base64);
#   3. os secrets/variables do GitHub (linhas NOME=valor-em-base64, tudo em base64), que viram o
#      segredos.env. Só os nomes da lista abaixo são aceitos.
# Sem a entrada (deploy à mão), usa o login e os arquivos de compose que já estão no servidor.
#
# Instalado no servidor em /usr/local/bin/casamento-deploy. A chave SSH do GitHub Actions só pode
# rodar este comando (em /root/.ssh/authorized_keys):
#   restrict,command="/usr/local/bin/casamento-deploy" ssh-ed25519 AAAA... github-actions-deploy@casamento
# O que o cliente pede no SSH chega em $SSH_ORIGINAL_COMMAND e só vale se for "<parte> [commit]".
set -eu

# Separa "parte commit" em palavras, sem expandir * ou ? (set -f).
set -f
# shellcheck disable=SC2086
set -- ${SSH_ORIGINAL_COMMAND:-${*:-tudo}}
alvo="${1:-tudo}"
tag="${2:-latest}"
case "$alvo" in
  backend) servicos="api" ;;
  frontend) servicos="web" ;;
  tudo) servicos="api web" ;;
  *) echo "Uso: casamento-deploy backend|frontend|tudo [commit]"; exit 2 ;;
esac
case "$tag" in
  latest) ;;
  *) printf '%s' "$tag" | grep -Eq '^[0-9a-f]{7,40}$' || { echo "Commit inválido: $tag"; exit 2; } ;;
esac

cd /opt/casamento

# Um deploy por vez: backend e frontend do mesmo push esperam um pelo outro (até 15 min).
exec 9>/var/lock/casamento-deploy.lock
flock -w 900 9 || { echo "Outro deploy demorou demais; tente de novo."; exit 1; }

token=""
pacote=""
segredos=""
if [ ! -t 0 ]; then
  read -r token || true
  read -r pacote || true
  read -r segredos || true
fi

# Arquivos de compose do commit publicado: só esses dois nomes são aceitos do pacote.
if [ -n "$pacote" ]; then
  tmp=$(mktemp -d)
  printf '%s' "$pacote" | base64 -d | tar -xzf - -C "$tmp" compose.yaml compose.producao.yaml
  for f in compose.yaml compose.producao.yaml; do
    [ -s "$tmp/$f" ] || { echo "Pacote sem $f"; rm -rf "$tmp"; exit 1; }
    install -m 644 "$tmp/$f" "$f"
  done
  rm -rf "$tmp"
fi
echo "Deploy: $alvo @ $tag"

# Segredos do GitHub → segredos.env (lido pela API com env_file format: raw). Se mudou, a API é
# recriada mesmo num deploy só do frontend, para valer na hora.
PERMITIDOS=" ADMIN_EMAIL ADMIN_NOME ADMIN_PASSWORD STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET EMAIL_FROM EMAIL_REPLY_TO "
segredos_mudaram=false
if [ -n "$segredos" ]; then
  novo=$(mktemp)
  chmod 600 "$novo"
  printf '%s' "$segredos" | base64 -d | while IFS= read -r linha || [ -n "$linha" ]; do
    nome="${linha%%=*}"
    case "$PERMITIDOS" in *" $nome "*) ;; *) echo "Segredo ignorado: $nome" >&2; continue ;; esac
    valor=$(printf '%s' "${linha#*=}" | base64 -d)
    case "$valor" in *"
"*) echo "Segredo com quebra de linha ignorado: $nome" >&2; continue ;; esac
    printf '%s=%s\n' "$nome" "$valor"
  done > "$novo"
  if ! cmp -s "$novo" segredos.env 2>/dev/null; then
    install -m 600 "$novo" segredos.env
    segredos_mudaram=true
    echo "segredos.env atualizado ($(wc -l < segredos.env) valores)."
  fi
  rm -f "$novo"
fi

# Guarda no .env qual imagem cada serviço usa: qualquer "compose up" depois mantém a versão publicada.
gravar() {
  if grep -q "^$1=" .env; then sed -i "s/^$1=.*/$1=$2/" .env; else echo "$1=$2" >> .env; fi
}
case "$alvo" in
  backend) gravar API_TAG "$tag" ;;
  frontend) gravar WEB_TAG "$tag" ;;
  tudo) gravar API_TAG "$tag"; gravar WEB_TAG "$tag" ;;
esac

if [ -n "$token" ]; then
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
  printf '%s' "$token" | docker login ghcr.io -u github-actions --password-stdin >/dev/null
fi

compose="docker compose -f compose.yaml -f compose.producao.yaml"
# shellcheck disable=SC2086
$compose pull --quiet $servicos
if [ "$alvo" = tudo ]; then
  $compose up -d --no-build --wait
else
  # --no-deps: o deploy do backend não mexe no front, e vice-versa.
  # shellcheck disable=SC2086
  $compose up -d --no-build --no-deps --wait $servicos
  # (Só se a API já existe: no primeiro push o Frontend pode terminar antes do Backend.)
  if [ "$segredos_mudaram" = true ] && [ "$alvo" = frontend ] && [ -n "$($compose ps -q api)" ]; then
    $compose up -d --no-build --no-deps --wait --force-recreate api
  fi
fi

# Login do painel: o seed cria/atualiza a conta com ADMIN_EMAIL/ADMIN_PASSWORD (em produção não
# cadastra conteúdo de exemplo).
if [ "$segredos_mudaram" = true ] && [ -n "$($compose ps -q api)" ] \
  && grep -q '^ADMIN_EMAIL=.' segredos.env && grep -q '^ADMIN_PASSWORD=.' segredos.env; then
  $compose exec -T api node src/seed.ts
fi
docker image prune -f >/dev/null
echo "Deploy concluído ($alvo @ $tag)."
