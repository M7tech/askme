FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
FROM node:24-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY server ./server
COPY migrations ./migrations
COPY public ./public
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node","server/app.mjs"]
FROM nginxinc/nginx-unprivileged:stable-alpine AS frontend
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY public /usr/share/nginx/html
EXPOSE 8080
