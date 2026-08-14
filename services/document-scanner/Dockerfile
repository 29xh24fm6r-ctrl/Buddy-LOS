FROM clamav/clamav:1.4-debian13-slim AS clamav-signatures

FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends clamav ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=clamav:clamav package.json server.mjs ./
RUN chmod 0444 /app/package.json /app/server.mjs
COPY --from=clamav-signatures --chown=clamav:clamav /var/lib/clamav /var/lib/clamav
ENV PORT=8080 MAX_FILE_BYTES=26214400 SCANNER_PROVIDER=buddy-private-clamav SCANNER_ENABLED=false SCANNER_CALLBACK_ORIGIN=
EXPOSE 8080
USER clamav
CMD ["node", "/app/server.mjs"]
