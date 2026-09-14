# Home Assistant Add-on image. Built by the Supervisor, which injects
# BUILD_FROM per-architecture (see build.yaml). For a plain `docker build`
# outside of Home Assistant, use Dockerfile.standalone instead.
ARG BUILD_FROM
FROM $BUILD_FROM

# Home Assistant's Alpine-based add-on images don't ship Node.js.
# python3/make/g++ are only needed to compile better-sqlite3's native
# module at build time.
RUN apk add --no-cache nodejs npm

WORKDIR /app
COPY package.json package-lock.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --omit=dev --no-audit --no-fund \
    && apk del .build-deps

COPY server ./server
COPY public ./public
COPY run.sh /
RUN chmod a+x /run.sh

LABEL \
  io.hass.name="Recipe Box" \
  io.hass.description="Self-hosted recipe manager: share recipes from Claude, share out to social apps, check ingredient prices at Prisma/Citymarket" \
  io.hass.type="addon" \
  io.hass.version="1.5.4"

CMD [ "/run.sh" ]
