# From the repository root:  docker build -f server/Dockerfile -t habiloop-notifier server
FROM node:22-slim
WORKDIR /app
COPY package.json ./package.json
RUN npm install --omit=dev
COPY src ./src
CMD ["node", "src/index.js"]
