FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends clamav ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && freshclam
WORKDIR /app
COPY package.json server.mjs ./
RUN chown -R clamav:clamav /var/lib/clamav
ENV PORT=8080 MAX_FILE_BYTES=26214400 SCANNER_PROVIDER=buddy-private-clamav SCANNER_ENABLED=false SCANNER_CALLBACK_ORIGIN=
EXPOSE 8080
USER clamav
CMD ["node", "/app/server.mjs"]
