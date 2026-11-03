FROM node:22-alpine
RUN apk add --no-cache poppler-utils
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY server.mjs thumbnail.mjs generate-thumbnails.mjs ./
CMD ["npm", "start"]
