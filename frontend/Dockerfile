FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# The lockfile was generated with npm 11 (locally); node:20-alpine ships
# npm 10, which resolves optional platform-esbuild deps differently and
# rejects the lockfile as out of sync. Match the npm major that produced it.
RUN npm install -g npm@11 && npm ci

COPY . .

# Vite inlines VITE_* vars into the bundle at build time, so they must be
# supplied as build args (not runtime env) — default to same-origin relative
# paths, which is what docker-compose.prod.yml's nginx proxy expects.
ARG VITE_API_BASE_URL=/api
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_EMAILJS_SERVICE_ID=
ARG VITE_EMAILJS_TEMPLATE_ID=
ARG VITE_EMAILJS_PUBLIC_KEY=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_EMAILJS_SERVICE_ID=$VITE_EMAILJS_SERVICE_ID \
    VITE_EMAILJS_TEMPLATE_ID=$VITE_EMAILJS_TEMPLATE_ID \
    VITE_EMAILJS_PUBLIC_KEY=$VITE_EMAILJS_PUBLIC_KEY

RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
