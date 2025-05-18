# Makefile for running RabbitMQ with limited resources and benchmarking with Go

.PHONY: build-latency-server

build-latency-server:
	@echo "Building latency-server..."
	@mkdir -p output
	@cd cmd/latency-server && go build -o ../../output/latency-server .