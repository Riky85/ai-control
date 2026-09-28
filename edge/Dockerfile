# angar Edge — local multi-stage build (static musl binary, tiny final image).
#   docker build -t angar-edge edge/
# CI builds the published image from prebuilt binaries instead (Dockerfile.release).
FROM rust:1-alpine AS build
RUN apk add --no-cache musl-dev gcc
WORKDIR /src
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
RUN cargo build --release && strip target/release/angar-edge

FROM gcr.io/distroless/static-debian12
COPY --from=build /src/target/release/angar-edge /usr/local/bin/angar-edge
ENV ANGAR_STATE_DIR=/var/lib/angar-edge
WORKDIR /var/lib/angar-edge
VOLUME ["/var/lib/angar-edge"]
EXPOSE 53/udp 53/tcp 514/udp 514/tcp 5514/udp 5514/tcp
# token via env: -e ANGAR_EDGE_TOKEN=ange_…
ENTRYPOINT ["/usr/local/bin/angar-edge"]
