# syntax=docker/dockerfile:1.7

# --- build stage: install deps + compile Next.js -----------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Native-build tooling for any package that compiles on install (kept in this
# stage only; the runner image is clean).
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .

# Next.js evaluates route modules during `next build` (the "collect page data"
# pass). Better Auth's drizzleAdapter calls getDb() at module load, which
# requires DATABASE_URL and BETTER_AUTH_SECRET. These build-time placeholders
# satisfy that check; the real values come from docker-compose at runtime.
ENV DATABASE_URL=postgres://build-placeholder:build-placeholder@build-placeholder/build-placeholder
ENV BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime
RUN npm run build


# --- runner: minimal image that migrates then serves -------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# All deps come from the build stage; the runner installs nothing.
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
ENTRYPOINT ["./docker-entrypoint.sh"]
