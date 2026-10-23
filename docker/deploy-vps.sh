#!/bin/sh
# Deploy do site do casamento no VPS: baixa a imagem já construída no CI (registro do GitHub) e troca
# o container. O VPS não compila nada.
#
#   backend  <commit>  → api  (ghcr.io/victorandrad/casamento-api:<commit>)   workflow "Backend"
#   frontend <commit>  → web  (ghcr.io/victorandrad/casamento-web:<commit>)   workflow "Frontend"
#   tudo     [commit]  → api + web (+ db)                                      à mão
#
# O VPS não guarda o código (nada de git clone): /opt/casamento tem só .env, compose.yaml e
# compose.producao.yaml. Pela entrada padrão o workflow manda duas linhas:
#   1. o token do registro (o GITHUB_TOKEN do job, que expira no fim dele);
#   2. os dois arquivos de compose do commit publicado (tar.gz em base64).
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
if [ ! -t 0 ]; then
  read -r token || true
  read -r pacote || true
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
fi
docker image prune -f >/dev/null
echo "Deploy concluído ($alvo @ $tag)."
