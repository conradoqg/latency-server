// Package main implements timming, a lightweight HTTP proxy server for the Timming HTTP API
// with embedded or local web UI for management. It supports CORS, request logging,
// and path-based proxying with URL validation.
package main

import (
   "embed"
   "io"
   "io/fs"
   "log"
   "net/http"
   "os"
   "strings"
   "encoding/json"
   "time"

   "github.com/gorilla/websocket"
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
       log.Println("WebSocket upgrade error:", err)
       return
   }
   defer conn.Close()
   for {
       msgType, msg, err := conn.ReadMessage()
       if err != nil {
           log.Println("WebSocket read error:", err)
           break
       }
       if err := conn.WriteMessage(msgType, msg); err != nil {
           log.Println("WebSocket write error:", err)
           break
       }
   }
}

func main() {
	log.Printf("timming version %s", Version)
	// serve static files: from local ./ui if available, else from embedded assets
	var fileSystem http.FileSystem
	var useLocal bool
	if stat, err := os.Stat("./ui"); err == nil && stat.IsDir() {
		fileSystem = http.Dir("./ui")
		useLocal = true
		log.Println("Serving UI from local ./ui directory")
	} else {
		subFS, err := fs.Sub(embeddedUI, "ui")
		if err != nil {
			log.Fatalf("failed to access embedded UI assets: %v", err)
		}
		fileSystem = http.FS(subFS)
		log.Println("Serving embedded UI assets")
	}

	// Create router and attach handlers
   	mux := http.NewServeMux()
   	// REST endpoint for latency measurement
   	mux.HandleFunc("/api/latency", latencyRESTHandler)
   	// WebSocket endpoint for latency measurement
   	mux.HandleFunc("/ws/latency", latencyWSHandler)
	// Serve index.html with DEFAULT_URL injection and other static assets
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// If root or index.html, inject DEFAULT_URL placeholder
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
			defaultUrl := os.Getenv("DEFAULT_URL")
			// Escape for JS string literal
			escaped := strings.ReplaceAll(defaultUrl, "\\", "\\\\")
			escaped = strings.ReplaceAll(escaped, "\"", "\\\"")
			// Escape PAGE_SUFFIX env var for injection
			suffix := os.Getenv("PAGE_SUFFIX")
			escapedSuffix := strings.ReplaceAll(suffix, "\\", "\\\\")
			escapedSuffix = strings.ReplaceAll(escapedSuffix, "\"", "\\\"")
			// Inject placeholders
			content := strings.ReplaceAll(string(data), "%%DEFAULT_URL%%", escaped)
			content = strings.ReplaceAll(content, "%%PAGE_SUFFIX%%", escapedSuffix)
			w.Header().Set("Content-Type", "text/html")
			w.Write([]byte(content))
			return
		}
		// Serve other static assets
		http.FileServer(fileSystem).ServeHTTP(w, r)
	})

	addr := ":8080"
	log.Printf("Starting server on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
