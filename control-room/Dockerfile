FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_AEGIS_API_URL=http://localhost:8080
ARG VITE_AEGIS_BASIC_AUTH=operator:operator-demo-only
ENV VITE_AEGIS_API_URL=$VITE_AEGIS_API_URL
ENV VITE_AEGIS_BASIC_AUTH=$VITE_AEGIS_BASIC_AUTH
RUN npm run build
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
