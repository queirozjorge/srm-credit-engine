FROM node:22.23.3-alpine3.24 AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html *.config.ts tsconfig*.json eslint.config.js ./
COPY src/ src/
COPY e2e/ e2e/
RUN npm run build

FROM nginx:1.30.5-alpine3.24

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dist/ /usr/share/nginx/html/

EXPOSE 80 443
