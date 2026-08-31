FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vazio = o browser usa o mesmo host (nginx faz proxy de /ws → chat-hub).
ARG VITE_WS_URL=
ENV VITE_WS_URL=$VITE_WS_URL

RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
