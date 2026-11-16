FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
RUN --mount=type=secret,id=nimb_ca,required=false \
    apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* && \
    if [ -s /run/secrets/nimb_ca ]; then export npm_config_cafile=/run/secrets/nimb_ca NODE_EXTRA_CA_CERTS=/run/secrets/nimb_ca; fi && \
    npm ci --workspace=@nimb/api --include-workspace-root && \
    npm run db:generate && npm run build -w @nimb/api && npm cache clean --force
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node apps/api/dist/index.js"]
