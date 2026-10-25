# Build context: jackyun-portal. Only backend dependencies and pure shared rules enter the image.
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/azure/backend
COPY azure/backend/shared-package.json /app/package.json
COPY azure/backend/package.json azure/backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY azure/backend/*.mjs ./
COPY src/lib/local-workspace.ts /app/src/lib/local-workspace.ts
COPY src/lib/error-codes.ts /app/src/lib/error-codes.ts
COPY src/lib/sync/hash.ts src/lib/sync/schedule-safety.ts src/lib/sync/transfer.ts src/lib/sync/delta.ts src/lib/sync/compression.ts src/lib/sync/resource-model.ts /app/src/lib/sync/
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
