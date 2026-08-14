FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends clamav clamav-daemon ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && freshclam
WORKDIR /app
COPY package.json server.mjs ./
COPY entrypoint.sh /usr/local/bin/buddy-scanner-entrypoint
RUN chmod 0755 /usr/local/bin/buddy-scanner-entrypoint \
  && mkdir -p /run/clamav /var/log/clamav \
  && chown -R clamav:clamav /run/clamav /var/log/clamav /var/lib/clamav
ENV PORT=8080 MAX_FILE_BYTES=26214400 SCANNER_PROVIDER=buddy-private-clamav SCANNER_ENABLED=false SCANNER_CALLBACK_ORIGIN=
EXPOSE 8080
USER clamav
ENTRYPOINT ["buddy-scanner-entrypoint"]
