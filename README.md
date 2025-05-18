 # latency-server

 **latency-server** is a lightweight HTTP server for measuring and visualizing network latency. It provides both REST and WebSocket endpoints for latency measurement, along with an embedded (or local) web-based UI built with Preact and Chart.js for real-time visualization.

 ## Features
 - REST endpoint for latency measurement (`GET /api/latency`)
 - WebSocket endpoint for latency measurement (`/ws/latency`)
 - Web-based UI with:
   - Method selection (REST or WebSocket)
   - Frequency control (fixed intervals or as fast as possible)
   - Time range selection for displayed data
   - Start/stop control
   - Real-time latency chart powered by Chart.js
 - Embedded UI assets (no external build step) or local UI directory support for development
 - Configurable logging level via `LOG_LEVEL` (debug, info, warn, error, panic, fatal)
 - Optional `PAGE_SUFFIX` to customize the UI title and header
 - Docker multi-stage build for easy containerization

 ## Prerequisites
 - Go 1.21+ (for building from source)
 - Docker (optional, for containerized deployment)

 ## Installation

 ### Build from Source
 ```bash
 git clone https://github.com/yourusername/latency-server.git
 cd latency-server
 # Build using Go
 cd cmd/latency-server
 go build -o latency-server .

 # Or use the Makefile (binary will be in ./output/)
 make build-latency-server
 ```

 ### Docker
 ```bash
 # Build the Docker image
 docker build -t latency-server .

 # Run the container
 docker run -d -p 8080:8080 --name latency-server latency-server
 ```

 ## Usage

 Run the server (default port 8080):
 ```bash
 # From source directory
 ./latency-server

 # Or with environment variables
 LOG_LEVEL=info PAGE_SUFFIX="Test" ./latency-server
 ```

 Navigate to `http://localhost:8080` in your browser to access the UI.

 ## Configuration
 - `LOG_LEVEL` (default: `warn`): Set the logging verbosity (`debug`, `info`, `warn`, `error`, `fatal`, `panic`).
 - `PAGE_SUFFIX` (default: empty): Text to append to the page title and header in the UI.

 ## API Reference

 ### REST Endpoint
 `GET /api/latency`

 Response:
 ```json
 {
   "time": 1672531199000
 }
 ```
 - `time`: Server timestamp in milliseconds since Unix epoch.

 ### WebSocket Endpoint
 Connect to `ws://<host>:8080/ws/latency`

 - Send ping messages in JSON format:
   ```json
   { "t": 1672531199000 }
   ```
 - The server echoes back the same message, allowing computation of round-trip time.

 ## Web UI
 The UI is a single-page application located in `cmd/latency-server/ui`. No separate build step is required; assets are served directly or embedded into the binary. It uses:
 - [Preact](https://preactjs.com) and [HTM](https://github.com/developit/htm)
 - [Chart.js](https://www.chartjs.org) for charting
 - [Tailwind CSS](https://tailwindcss.com) with [DaisyUI](https://daisyui.com) for styling

 ## Contributing
 Contributions are welcome! Feel free to open issues or submit pull requests for improvements and bug fixes.

 ## License
 This project does not include a license file. Add a LICENSE as appropriate for your use case.