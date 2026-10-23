# Front-end a partir do build já feito (npm run build:frontend no CI): só copia os dist para o Nginx.
# É a imagem publicada no registro (ghcr.io/victorandrad/casamento-web) e usada em produção; o
# web.Dockerfile, que compila dentro do Docker, continua para o "docker compose --profile site" local.
# Contexto do build: a raiz do repositório (o web.dist.Dockerfile.dockerignore deixa entrar só os dist).
FROM nginx:1.30-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/shell/dist /usr/share/nginx/html
COPY apps/evento/dist /usr/share/nginx/html/mf/evento
COPY apps/rsvp/dist /usr/share/nginx/html/mf/rsvp
COPY apps/presentes/dist /usr/share/nginx/html/mf/presentes
COPY apps/mural/dist /usr/share/nginx/html/mf/mural
COPY apps/painel/dist /usr/share/nginx/html/mf/painel
RUN find /usr/share/nginx/html -name 'mf-stats.json' -delete

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO /dev/null http://127.0.0.1/healthz || exit 1
