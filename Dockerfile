# Stage 1: build
FROM node:24.14.1-alpine3.23 AS builder

WORKDIR /app

# Copia apenas arquivos de dependência primeiro para melhor cache
COPY package*.json ./

# Instala dependências de forma reproduzível
RUN npm ci

# Copia o restante do projeto
COPY . .

# Variável usada pelo Vite no build
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Gera build de produção
RUN npm run build

# Stage 2: runtime
FROM nginxinc/nginx-unprivileged:alpine3.23 AS runner

# Remove config padrão
RUN rm /etc/nginx/conf.d/default.conf

# Copia config customizada
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia artefato final
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]