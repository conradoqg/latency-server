// Package main implements latency-server, a lightweight HTTP proxy server for the latency-server HTTP API
// with embedded or local web UI for management. It supports CORS, request logging,
// and path-based proxying with URL validation.
package main

import (
	"embed"
	"encoding/json"
	"io"
	"io/fs"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/sirupsen/logrus"
)

// embeddedUI holds the static web UI assets when built into the binary.

//go:embed ui
var embeddedUI embed.FS

// Version indicates the application version.
const Version = "1.0.5"

// wsUpgrader upgrades HTTP connections to WebSocket protocol.
var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// latencyResp is the JSON response for REST latency endpoint.
type latencyResp struct {
	Time int64 `json:"time"`
}

// latencyRESTHandler handles REST ping requests and returns server time in milliseconds.
func latencyRESTHandler(w http.ResponseWriter, r *http.Request) {
	logrus.Infof("REST /api/latency called from %s", r.RemoteAddr)
	w.Header().Set("Content-Type", "application/json")
	resp := latencyResp{
		Time: time.Now().UnixNano() / int64(time.Millisecond),
	}
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}

// latencyWSHandler handles WebSocket ping messages by echoing them back.
func latencyWSHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		logrus.Errorf("WebSocket upgrade error: %v", err)
		return
	}
	logrus.Infof("WebSocket /ws/latency connect from %s", r.RemoteAddr)
	defer conn.Close()
	for {
		msgType, msg, err := conn.ReadMessage()
		if err != nil {
			logrus.Warnf("WebSocket read error: %v", err)
			break
		}
		logrus.Debugf("WebSocket message from %s: %s", r.RemoteAddr, string(msg))
		if err := conn.WriteMessage(msgType, msg); err != nil {
			logrus.Warnf("WebSocket write error: %v", err)
			break
		}
	}
}

func main() {
	// Configure logging from LOG_LEVEL env var (debug, info, warn, error, fatal, panic)
	levelStr := os.Getenv("LOG_LEVEL")
	// default to 'warn' if not set
	if levelStr == "" {
		levelStr = "warn"
	}
	level, err := logrus.ParseLevel(levelStr)
	if err != nil {
		logrus.Fatalf("invalid LOG_LEVEL '%s': %v", levelStr, err)
	}
	logrus.SetLevel(level)
	logrus.SetFormatter(&logrus.TextFormatter{FullTimestamp: true})
	logrus.Infof("latency-server version %s", Version)
	// serve static files: from local ./ui if available, else from embedded assets
	var fileSystem http.FileSystem
	var useLocal bool
	if stat, err := os.Stat("./ui"); err == nil && stat.IsDir() {
		fileSystem = http.Dir("./ui")
		useLocal = true
		logrus.Infof("Serving UI from local ./ui directory")
	} else {
		subFS, err := fs.Sub(embeddedUI, "ui")
		if err != nil {
			logrus.Fatalf("failed to access embedded UI assets: %v", err)
		}
		fileSystem = http.FS(subFS)
		logrus.Infof("Serving embedded UI assets")
	}

	// Create router and attach handlers
	mux := http.NewServeMux()
	// REST endpoint for latency measurement
	mux.HandleFunc("/api/latency", latencyRESTHandler)
	// WebSocket endpoint for latency measurement
	mux.HandleFunc("/ws/latency", latencyWSHandler)
	// Serve index.html with PAGE_SUFFIX injection and other static assets
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// If root or index.html, inject PAGE_SUFFIX placeholder
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			var data []byte
			var err error
			if useLocal {
				data, err = os.ReadFile("./ui/index.html")
			} else {
				f, errOpen := fileSystem.Open("index.html")
				if errOpen != nil {
					http.Error(w, "Internal Server Error", http.StatusInternalServerError)
					return
				}
				data, err = io.ReadAll(f)
				f.Close()
			}
			if err != nil {
				http.Error(w, "Failed to read index.html", http.StatusInternalServerError)
				return
			}
			// Escape PAGE_SUFFIX env var for injection
			suffix := os.Getenv("PAGE_SUFFIX")
			escapedSuffix := strings.ReplaceAll(suffix, "\\", "\\\\")
			escapedSuffix = strings.ReplaceAll(escapedSuffix, "\"", "\\\"")
			// Inject placeholder
			content := strings.ReplaceAll(string(data), "%%PAGE_SUFFIX%%", escapedSuffix)
			w.Header().Set("Content-Type", "text/html")
			w.Write([]byte(content))
			return
		}
		// Serve other static assets
		http.FileServer(fileSystem).ServeHTTP(w, r)
	})

	addr := ":8080"
	logrus.Infof("Starting server on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		logrus.Fatal(err)
	}
}
