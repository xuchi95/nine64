# Nine64 play-engine — official Stockfish 18 built from source.
#
# Stockfish is free software licensed under the GNU General Public License v3.
# The build stage below IS the corresponding source/build instruction required
# by the GPL: the engine is compiled unmodified from the upstream repository and
# is NOT rebranded as proprietary Nine64 technology.
FROM debian:bookworm-slim AS engine

ARG STOCKFISH_REF=sf_18
ARG ARCH=x86-64-avx2

RUN apt-get update && apt-get install -y --no-install-recommends \
      git build-essential ca-certificates wget && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone --depth 1 --branch ${STOCKFISH_REF} https://github.com/official-stockfish/Stockfish.git
WORKDIR /build/Stockfish/src
# `net` downloads the official NNUE network that matches this exact binary.
RUN make -j"$(nproc)" profile-build ARCH=${ARCH} && make net && strip stockfish

FROM node:20-slim AS runtime

ARG SERVICE_BUILD_ID=play-engine-titan-v6.3

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=engine /build/Stockfish/src/stockfish /usr/local/bin/stockfish
COPY --from=engine /build/Stockfish/Copying.txt /usr/share/doc/stockfish/Copying.txt
COPY --from=engine /build/Stockfish/AUTHORS /usr/share/doc/stockfish/AUTHORS

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
COPY LICENSE README.md ./

ENV NODE_ENV=production \
    PORT=8080 \
    STOCKFISH_PATH=/usr/local/bin/stockfish \
    ENGINE_POOL_SIZE=1 \
    SERVICE_BUILD_ID=${SERVICE_BUILD_ID}

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
