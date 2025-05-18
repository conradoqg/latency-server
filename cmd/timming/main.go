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
)

// embeddedUI holds the static web UI assets when built into the binary.

//go:embed ui
var embeddedUI embed.FS

// Version indicates the application version.
const Version = "1.0.5"

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
			content := strings.ReplaceAll(string(data), "%%DEFAULT_URL%%", escaped)
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
