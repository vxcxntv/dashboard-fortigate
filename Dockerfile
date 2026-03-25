# Estágio 1: Build da aplicação React
FROM node:20-alpine as build
WORKDIR /app

# Copia os arquivos de dependência
COPY package*.json ./

# Instala as dependências listadas
RUN npm install

# GARANTIA: Força a instalação das bibliotecas extras usadas no App.jsx
RUN npm install lucide-react tailwindcss postcss autoprefixer html2canvas jspdf

# Copia o resto do código
COPY . .

# Executa o build
RUN npm run build

# Estágio 2: Servir com Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
RUN sed -i 's/80/8080/g' /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]