# ---- Build the React client ----
FROM node:22-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ---- API + static client ----
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
# Includes the optional transformers.js dependency for local Sentence-Transformers embeddings.
RUN npm install --omit=dev
COPY server/ ./
COPY samples/ /app/samples/
COPY --from=client /app/client/dist /app/client/dist
RUN mkdir -p /app/.model-cache && chown -R node:node /app
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://localhost:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
