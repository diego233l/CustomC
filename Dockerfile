# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Etapa 1: compilación de la app estática (independiente de la arquitectura).
# ---------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Certificado de CA opcional (solo para builds detrás de un proxy corporativo):
#   docker build --secret id=ca,src=/ruta/ca.crt .
# No se copia a la imagen final.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN npm run catalog:validate && npm run build

# ---------------------------------------------------------------------------
# Etapa 2: servidor web mínimo, sin root, solo lectura.
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.29-alpine
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Configurador Tesla 3D" \
      org.opencontainers.image.description="Configurador 3D web de Tesla Model S, 3, X e Y" \
      org.opencontainers.image.source="https://github.com/diego233l/CustomC" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.licenses="MIT"
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/custom-README.txt /srv/configurador/custom/LEEME.txt
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
