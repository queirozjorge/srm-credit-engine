FROM node:22.23.3-alpine3.24 AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json eslint.config.js ./
COPY src/ src/
RUN npm run build

FROM nginx:1.30.5-alpine3.24

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dist/ /usr/share/nginx/html/

EXPOSE 80 443
