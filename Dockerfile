# syntax=docker/dockerfile:1.6

############################
# Stage 1: install deps
############################
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

############################
# Stage 2: build
############################
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

############################
# Stage 3: runtime
############################
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Install only prod deps
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
    && npm cache clean --force
COPY --from=build /app/dist ./dist
# Non-root user
RUN addgroup -S app && adduser -S app -G app \
    && chown -R app:app /app
USER app
EXPOSE 18791
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:18791/health || exit 1
CMD ["node", "dist/index.js"]
