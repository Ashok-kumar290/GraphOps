FROM golang:1.25-alpine@sha256:1ae0735f00daffa3aaf1363a5184c0d2dc55c78e3db4ec70241cdac97bf84b59 AS lab-build
WORKDIR /src
COPY lab/ ./
RUN CGO_ENABLED=0 go build -trimpath -o /lab .

FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS web-build
WORKDIR /web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM python:3.13-slim-bookworm@sha256:a1165e272e578941b84abc79e4ab38a0305cd12803a5c4247979ac7655f4d641
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 libatomic1 && rm -rf /var/lib/apt/lists/*
COPY --from=web-build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock
COPY graphops/ ./graphops/
COPY web/server.ts ./web/server.ts
COPY web/api/ ./web/api/
COPY web/package.json ./web/package.json
COPY --from=web-build /web/dist ./web/dist
COPY --from=lab-build /lab /usr/local/bin/graphops-lab
ENV PYTHONUNBUFFERED=1 GRAPHOPS_LAB_BINARY=/usr/local/bin/graphops-lab GRAPHOPS_PYTHON=/usr/local/bin/python HOST=0.0.0.0 PORT=8080
RUN useradd -m -u 10001 graphops && mkdir -p /app/.runtime && chown -R graphops:graphops /app
USER graphops
EXPOSE 8080
CMD ["node", "web/server.ts"]
