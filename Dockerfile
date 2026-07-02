# ---- Build Frontend ----
FROM node:24-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Build Backend ----
FROM node:24-alpine
WORKDIR /app

# Copy backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ ./

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Create required directories
RUN mkdir -p /app/uploads /app/config

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "src/index.js"]
