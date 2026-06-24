# Korea Trip Concierge — MCP server (Streamable HTTP, stateless).
# MUST build for linux/amd64 (KC rejects arm64). Build:
#   docker build --platform linux/amd64 -t korea-trip-concierge .
# KC Git-source build uses this root Dockerfile directly.
FROM --platform=linux/amd64 node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build

FROM --platform=linux/amd64 node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/server.js"]
