# Estágio de Build
FROM node:20-alpine AS build

WORKDIR /app

# Copiar apenas arquivos de dependências primeiro para cache eficiente
COPY package*.json ./
RUN npm install

# Copiar o restante do código
COPY . .

# Build da aplicação Vite
RUN npm run build

# Estágio de Produção (Nginx para servir os estáticos)
FROM nginx:stable-alpine

# Copiar build do estágio anterior para o diretório do Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Copiar configuração customizada do Nginx (opcional, para lidar com SPA routes)
# RUN echo "server { listen 80; location / { root /usr/share/nginx/html; try_files \$uri \$uri/ /index.html; } }" > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]