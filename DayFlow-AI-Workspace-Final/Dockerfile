FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/data/dayflow.db
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 3001
VOLUME ["/data"]
CMD ["npm", "start"]
