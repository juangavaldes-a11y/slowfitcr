FROM node:20-alpine

WORKDIR /app

COPY backend/package.json ./package.json
COPY backend/prisma ./prisma
COPY backend/server.mjs ./server.mjs
COPY backend/package-lock.json ./package-lock.json

RUN npm ci
RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "run", "start"]
