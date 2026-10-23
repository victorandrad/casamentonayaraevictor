# Site completo compilado dentro do Docker, para o "docker compose --profile site up --build" local.
# Em produção o CI faz o build uma vez e publica o docker/web.dist.Dockerfile.
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/shell/package.json apps/shell/package.json
COPY apps/evento/package.json apps/evento/package.json
COPY apps/rsvp/package.json apps/rsvp/package.json
COPY apps/presentes/package.json apps/presentes/package.json
COPY apps/mural/package.json apps/mural/package.json
COPY apps/painel/package.json apps/painel/package.json
RUN npm ci --ignore-scripts \
      -w @nv/shared -w @nv/shell -w @nv/evento -w @nv/rsvp -w @nv/presentes -w @nv/mural -w @nv/painel \
  && npm cache clean --force

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/shell apps/shell
COPY apps/evento apps/evento
COPY apps/rsvp apps/rsvp
COPY apps/presentes apps/presentes
COPY apps/mural apps/mural
COPY apps/painel apps/painel

# O shell carrega o manifest de cada remoto destas URLs (packages/shared/federation.ts).
ARG SITE_URL=http://localhost:8088
ENV MF_SHELL_URL=${SITE_URL} \
    MF_EVENTO_URL=${SITE_URL}/mf/evento \
    MF_RSVP_URL=${SITE_URL}/mf/rsvp \
    MF_PRESENTES_URL=${SITE_URL}/mf/presentes \
    MF_MURAL_URL=${SITE_URL}/mf/mural \
    MF_PAINEL_URL=${SITE_URL}/mf/painel
RUN npm run build:frontend

FROM nginx:1.30-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/shell/dist /usr/share/nginx/html
COPY --from=build /app/apps/evento/dist /usr/share/nginx/html/mf/evento
COPY --from=build /app/apps/rsvp/dist /usr/share/nginx/html/mf/rsvp
COPY --from=build /app/apps/presentes/dist /usr/share/nginx/html/mf/presentes
COPY --from=build /app/apps/mural/dist /usr/share/nginx/html/mf/mural
COPY --from=build /app/apps/painel/dist /usr/share/nginx/html/mf/painel
RUN find /usr/share/nginx/html -name 'mf-stats.json' -delete

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO /dev/null http://127.0.0.1/healthz || exit 1
