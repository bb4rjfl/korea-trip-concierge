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

# API keys are injected at IMAGE-BUILD time via --build-arg, sourced from CI
# secrets (GitHub Actions → encrypted GitHub Secrets) — NEVER committed to the
# repo. Defaults are empty, so a keyless build (e.g. KC Git-source build) still
# runs (knowledge tools only). The built image therefore contains the keys and
# MUST be pushed to a PRIVATE registry.
ARG TOUR_API_KEY=""
ARG BUS_API_KEY=""
ARG TRANSIT_API_KEY=""
ARG SUBWAY_API_KEY=""
ARG SEOUL_API_KEY=""
ARG JEJU_API_KEY=""
ARG NAVER_CLIENT_ID=""
ARG NAVER_CLIENT_SECRET=""
ARG FOURSQUARE_API_KEY=""
ARG VISITSEOUL_API_KEY=""
ARG KAKAO_REST_API_KEY=""
ENV TOUR_API_KEY=$TOUR_API_KEY \
    BUS_API_KEY=$BUS_API_KEY \
    TRANSIT_API_KEY=$TRANSIT_API_KEY \
    SUBWAY_API_KEY=$SUBWAY_API_KEY \
    SEOUL_API_KEY=$SEOUL_API_KEY \
    JEJU_API_KEY=$JEJU_API_KEY \
    NAVER_CLIENT_ID=$NAVER_CLIENT_ID \
    NAVER_CLIENT_SECRET=$NAVER_CLIENT_SECRET \
    FOURSQUARE_API_KEY=$FOURSQUARE_API_KEY \
    VISITSEOUL_API_KEY=$VISITSEOUL_API_KEY \
    KAKAO_REST_API_KEY=$KAKAO_REST_API_KEY

EXPOSE 8080
CMD ["node", "dist/server.js"]
