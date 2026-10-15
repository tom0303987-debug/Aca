FROM node:24.21.0-bookworm-slim
WORKDIR /app
COPY --chown=node:node server ./server
COPY --chown=node:node web ./web
COPY --chown=node:node scripts/backup.mjs ./scripts/backup.mjs
RUN mkdir -p /app/data /app/backups && chown -R node:node /app/data /app/backups
USER node
ENV NODE_ENV=production ACA_BIND=0.0.0.0 ACA_DEV_PORT=8787 ACA_DATA_DIR=/app/data
EXPOSE 8787
CMD ["node","server/main.mjs"]
