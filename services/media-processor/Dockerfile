# Media processor for Cloud Run (doc 22 §A4). Build from the repository root,
# because the bundle includes the shared pipeline in scripts/media and src/domain:
#   docker build -f services/media-processor/Dockerfile -t media-processor .
# Only the files listed in Dockerfile.dockerignore enter the build context.

FROM node:22-bookworm-slim AS build
WORKDIR /build
COPY services/media-processor/package.json services/media-processor/package-lock.json services/media-processor/
RUN npm --prefix services/media-processor ci --no-audit --no-fund
COPY src/domain src/domain
COPY scripts/media scripts/media
COPY services/media-processor/build.mjs services/media-processor/
COPY services/media-processor/src services/media-processor/src
RUN npm --prefix services/media-processor run build

FROM node:22-bookworm-slim
# ffmpeg/ffprobe from Debian; no recommends keeps the image small.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /build/services/media-processor/dist/server.js /app/server.js
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080
# The base image's unprivileged "node" user; /tmp is the only writable path needed.
USER node
EXPOSE 8080
CMD ["node", "/app/server.js"]
