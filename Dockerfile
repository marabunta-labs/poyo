FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
COPY scripts ./scripts
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data TRUST_PROXY=1
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "server.js"]
