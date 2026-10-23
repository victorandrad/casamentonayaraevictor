# Production web image: builds the shell and every microfrontend, then serves
# them with Caddy on one domain (remotes under /mf/<app>/).
#   docker build -f deploy/web.Dockerfile --build-arg SITE_URL=https://casamentonayaraevictor.com.br .
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

# The shell loads each remote's manifest from these URLs (see packages/shared/federation.ts).
ARG SITE_URL=https://casamentonayaraevictor.com.br
ENV MF_SHELL_URL=${SITE_URL} \
    MF_EVENTO_URL=${SITE_URL}/mf/evento \
    MF_RSVP_URL=${SITE_URL}/mf/rsvp \
    MF_PRESENTES_URL=${SITE_URL}/mf/presentes \
    MF_MURAL_URL=${SITE_URL}/mf/mural \
    MF_PAINEL_URL=${SITE_URL}/mf/painel

RUN for app in shell evento rsvp presentes mural painel; do npm run build -w @nv/$app || exit 1; done \
  && mkdir -p /out/mf \
  && cp -r apps/shell/dist/. /out/ \
  && for app in evento rsvp presentes mural painel; do mkdir -p /out/mf/$app && cp -r apps/$app/dist/. /out/mf/$app/; done \
  && find /out -name 'mf-stats.json' -delete

FROM caddy:2.10-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /out /srv
