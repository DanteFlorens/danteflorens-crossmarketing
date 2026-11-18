FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY lib ./lib
COPY public ./public
COPY src ./src
COPY assets ./assets
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN mkdir -p /app/data \
  && test -f /app/assets/fonts/Roboto-Regular.ttf \
  && chmod +x /docker-entrypoint.sh \
  && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=4177
ENV HOST=0.0.0.0
ENV NODE_OPTIONS=--experimental-sqlite

EXPOSE 4177
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4177)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
