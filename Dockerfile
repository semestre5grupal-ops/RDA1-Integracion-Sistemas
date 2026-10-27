# Backend Booking Prototipo (NestJS): REST en $PORT (3000) + gRPC en $GRPC_PORT (50051)
# en el mismo proceso, para que el stock recibido por gRPC lo vea el panel de admin.

# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- runtime ----------
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=3000 \
    GRPC_PORT=50051
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/src/proto ./src/proto
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir -p /app/logs && chown node:node /app/logs
USER node
EXPOSE 3000 50051
CMD ["node", "dist/main"]
