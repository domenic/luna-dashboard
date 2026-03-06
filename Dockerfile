FROM node:alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY server.mjs ./
COPY public/ ./public/
ENV DATA_PATH=/data/data.json
EXPOSE 3000
CMD ["npm", "start"]
