FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci
COPY frontend/ ./frontend/
COPY src/ ./src/
COPY shared/ ./shared/
RUN npm run build
FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
