# Estágio 1: Build da aplicação React
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Estágio 2: Servir com Nginx
FROM nginx:alpine
# Copia os arquivos compilados do Vite para a pasta pública do Nginx
COPY --from=build /app/dist /usr/share/nginx/html
# Expõe a porta 80
EXPOSE 80
# Inicia o Nginx
CMD ["nginx", "-g", "daemon off;"]