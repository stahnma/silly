FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# onnxruntime-node ships binaries for every platform plus GPU providers;
# keep only the CPU runtime for this one (about 48 MB instead of 430 MB).
RUN npm ci --omit=dev && npm cache clean --force \
 && arch=$(node -p process.arch) \
 && cd node_modules/onnxruntime-node/bin/napi-v6 \
 && find . -mindepth 2 -maxdepth 2 -type d ! -path "./linux/$arch" -exec rm -rf {} + \
 && rm -f linux/$arch/libonnxruntime_providers_cuda.so linux/$arch/libonnxruntime_providers_tensorrt.so
COPY src ./src
COPY assets ./assets
COPY scripts ./scripts
USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
