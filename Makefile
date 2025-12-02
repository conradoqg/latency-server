# Docker image tag (override with `make docker-build IMAGE=repo/my-project:tag`)
IMAGE ?= latency-server:latest
BIN   ?= output/latency-server

.PHONY: build build-linux run test fmt vet docker-build docker-run docker-push clean

build:
	@echo "Building $(BIN)..."
	@mkdir -p output
	@GOCACHE=$$PWD/.gocache go build -o $(BIN) ./cmd/latency-server

build-linux:
	@echo "Building linux/amd64 binary..."
	@mkdir -p output
	@GOCACHE=$$PWD/.gocache CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o $(BIN)-linux-amd64 ./cmd/latency-server

run: build
	@./$(BIN) --config=config.yaml --listen=:8080

test:
	@GOCACHE=$$PWD/.gocache go test ./...

fmt:
	@go fmt ./...

vet:
	@go vet ./...

docker-build:
	@echo "Building Docker image $(IMAGE)..."
	@docker build -t $(IMAGE) .

docker-run:
	@docker run --rm -p 8080:8080 $(IMAGE)

docker-push:
	@docker push $(IMAGE)

clean:
	@rm -rf output .gocache
