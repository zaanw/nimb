FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN --mount=type=secret,id=nimb_ca,required=false \
    if [ -s /run/secrets/nimb_ca ]; then export npm_config_cafile=/run/secrets/nimb_ca NODE_EXTRA_CA_CERTS=/run/secrets/nimb_ca; fi && \
    npm ci --workspace=@nimb/web && npm run build -w @nimb/web && npm cache clean --force

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
