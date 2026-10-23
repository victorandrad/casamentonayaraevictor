# API do site de casamento. Node 24 executa TypeScript direto (type stripping), sem build.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Instala só as dependências de produção da API (workspace @nv/api).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --workspace @nv/api --omit=dev --ignore-scripts && npm cache clean --force

# Shared fee rules are used at runtime (TypeScript, no build step)
COPY packages/shared/src/taxas.ts packages/shared/src/taxas.ts
COPY packages/shared/src/types.ts packages/shared/src/types.ts
COPY packages/shared/src/config.ts packages/shared/src/config.ts
COPY packages/shared/src/categorias.ts packages/shared/src/categorias.ts
COPY apps/api/src apps/api/src
COPY apps/api/migrations apps/api/migrations

# Uploaded gift photos live here (mounted as a volume by compose.yaml)
RUN mkdir -p /app/uploads && chown node:node /app/uploads
ENV UPLOADS_DIR=/app/uploads

WORKDIR /app/apps/api
USER node
EXPOSE 4100
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 CMD wget -qO /dev/null http://127.0.0.1:4100/api/health || exit 1
CMD ["node", "src/server.ts"]
