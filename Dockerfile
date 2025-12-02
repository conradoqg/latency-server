###
# Multi-stage Dockerfile
###
FROM golang:1.21-alpine AS builder

WORKDIR /src

# Cache deps
COPY go.mod ./
COPY go.sum ./
RUN go mod download

# Copy the full source
COPY . .

# Build static binary
RUN GOCACHE=/src/.gocache CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/latency-server ./cmd/latency-server

FROM alpine:3.19 AS runtime
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /out/latency-server /app/latency-server
COPY config.example.yaml /app/config.yaml

EXPOSE 8080
ENTRYPOINT ["/app/latency-server"]
CMD []
