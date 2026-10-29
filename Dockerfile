FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY public ./public
COPY scripts ./scripts
COPY data/osm ./data/osm
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data TRUST_PROXY=1
EXPOSE 3000
USER node
CMD ["node", "server.js"]
