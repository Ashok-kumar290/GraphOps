// Four owned HTTP services with concurrent listeners and persisted idempotent effects.
package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

type Item struct {
	Revision string `json:"revision"`
	Fault    string `json:"fault"`
}
type Effect struct {
	Restored  bool   `json:"restored"`
	Service   string `json:"service"`
	Action    string `json:"action"`
	Operation string `json:"operation_id"`
	Expected  string `json:"expected_revision"`
}
type State struct {
	Services   map[string]Item   `json:"services"`
	Operations map[string]Effect `json:"operations"`
	Count      int               `json:"action_count"`
	Generation int               `json:"generation"`
}
type Lab struct {
	mu     sync.RWMutex
	state  State
	path   string
	port   int
	token  string
	client *http.Client
}

var names = []string{"gateway", "orders", "payments", "analytics"}
var dependencies = map[string]string{"gateway": "orders", "orders": "payments"}

func (l *Lab) save(next State) error {
	encoded, err := json.Marshal(next)
	if err != nil {
		return err
	}
	temp := l.path + ".tmp"
	f, err := os.OpenFile(temp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	if _, err = f.Write(encoded); err != nil {
		f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	if err = os.Rename(temp, l.path); err != nil {
		return err
	}
	l.state = next
	return nil
}
func (l *Lab) clone() State {
	b, _ := json.Marshal(l.state)
	var next State
	_ = json.Unmarshal(b, &next)
	return next
}
func respond(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
func readBody(w http.ResponseWriter, r *http.Request, out any) bool {
	reader := http.MaxBytesReader(w, r.Body, 8192)
	defer reader.Close()
	dec := json.NewDecoder(reader)
	dec.DisallowUnknownFields()
	if err := dec.Decode(out); err != nil {
		respond(w, 400, map[string]string{"error": "Invalid JSON request"})
		return false
	}
	return true
}
func (l *Lab) allowed(r *http.Request) bool {
	return l.token != "" && subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Lab-Token")), []byte(l.token)) == 1
}

// Drain bounded request bodies before rejecting so a close cannot reset a client
// that is still sending its small JSON payload (observed on Windows loopback).
func deny(w http.ResponseWriter, r *http.Request) {
	_, _ = io.Copy(io.Discard, io.LimitReader(r.Body, 8193))
	_ = r.Body.Close()
	respond(w, 403, map[string]string{"error": "Lab token required"})
}
func (l *Lab) url(name string) string {
	for offset, s := range names {
		if s == name {
			return fmt.Sprintf("http://127.0.0.1:%d", l.port+offset)
		}
	}
	return ""
}
func (l *Lab) health(service string) map[string]any {
	l.mu.RLock()
	item := l.state.Services[service]
	l.mu.RUnlock()
	healthy := item.Fault == ""
	result := map[string]any{"service": service, "revision": item.Revision, "healthy": healthy, "error": item.Fault, "observed_at": float64(time.Now().UnixMilli()) / 1000}
	if dep, ok := dependencies[service]; ok {
		childHealthy := false
		res, err := l.client.Get(l.url(dep) + "/health")
		if err == nil {
			var child map[string]any
			_ = json.NewDecoder(io.LimitReader(res.Body, 8192)).Decode(&child)
			res.Body.Close()
			childHealthy, _ = child["healthy"].(bool)
		}
		result["dependency"] = dep
		result["dependency_healthy"] = childHealthy
		result["healthy"] = healthy && childHealthy
	}
	return result
}
func (l *Lab) service(service string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" && r.URL.Path == "/health" {
			result := l.health(service)
			status := 200
			if result["healthy"] != true {
				status = 503
			}
			respond(w, status, result)
			return
		}
		if r.Method != "POST" || r.URL.Path != "/recover" {
			respond(w, 404, map[string]string{"error": "Not found"})
			return
		}
		if !l.allowed(r) {
			deny(w, r)
			return
		}
		var body struct {
			Operation string `json:"operation_id"`
			Action    string `json:"action"`
			Expected  string `json:"expected_revision"`
		}
		if !readBody(w, r, &body) {
			return
		}
		if len(body.Operation) < 1 || len(body.Operation) > 240 {
			respond(w, 400, map[string]string{"error": "Operation ID required"})
			return
		}
		l.mu.Lock()
		defer l.mu.Unlock()
		if old, ok := l.state.Operations[body.Operation]; ok {
			if old.Service != service || old.Action != body.Action || old.Expected != body.Expected {
				respond(w, 409, map[string]string{"error": "Operation identity conflict"})
				return
			}
			respond(w, 200, old)
			return
		}
		current := l.state.Services[service]
		supported := (service == "payments" && body.Action == "restore_config") || (service == "orders" && body.Action == "restart_worker")
		if !supported || current.Revision != body.Expected || current.Fault != body.Action {
			respond(w, 409, map[string]string{"error": "Action preconditions do not match"})
			return
		}
		next := l.clone()
		next.Services[service] = Item{Revision: "healthy-v1"}
		next.Count++
		effect := Effect{true, service, body.Action, body.Operation, body.Expected}
		next.Operations[body.Operation] = effect
		if err := l.save(next); err != nil {
			respond(w, 500, map[string]string{"error": "Could not persist effect"})
			return
		}
		respond(w, 200, effect)
	})
}
func (l *Lab) control(w http.ResponseWriter, r *http.Request) {
	if !l.allowed(r) {
		deny(w, r)
		return
	}
	if r.Method == "GET" && r.URL.Path == "/state" {
		l.mu.RLock()
		defer l.mu.RUnlock()
		respond(w, 200, l.state)
		return
	}
	if r.Method == "POST" && r.URL.Path == "/heal" {
		// A fault clears without any recovery action, as when another operator or a retry fixes it.
		var body struct {
			Service string `json:"service"`
		}
		if !readBody(w, r, &body) {
			return
		}
		l.mu.Lock()
		defer l.mu.Unlock()
		if _, ok := l.state.Services[body.Service]; !ok {
			respond(w, 400, map[string]string{"error": "Unknown service"})
			return
		}
		next := l.clone()
		next.Services[body.Service] = Item{Revision: "healthy-v1"}
		if err := l.save(next); err != nil {
			respond(w, 500, map[string]string{"error": "Could not persist heal"})
			return
		}
		respond(w, 200, map[string]any{"healed": body.Service, "action_count": next.Count})
		return
	}
	if r.Method != "POST" || r.URL.Path != "/inject" {
		respond(w, 404, map[string]string{"error": "Not found"})
		return
	}
	var body struct {
		Scenario   string `json:"scenario"`
		Distractor bool   `json:"distractor"`
	}
	if !readBody(w, r, &body) {
		return
	}
	// faults maps each faulted service to its revision and own error.
	faults := map[string]Item{}
	switch body.Scenario {
	case "config":
		faults["payments"] = Item{"config-broken-v1", "restore_config"}
	case "worker":
		faults["orders"] = Item{"worker-stopped-v1", "restart_worker"}
	case "unknown":
		// A fault no approved runbook covers; the familiar fix must not be applied.
		faults["payments"] = Item{"disk-full-v1", "disk_full"}
	case "double":
		faults["payments"] = Item{"config-broken-v1", "restore_config"}
		faults["orders"] = Item{"worker-stopped-v1", "restart_worker"}
	default:
		respond(w, 400, map[string]string{"error": "Unknown scenario"})
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	for name, item := range l.state.Services {
		if name != "analytics" && item.Fault != "" {
			respond(w, 409, map[string]string{"error": "An incident is active; resume it first"})
			return
		}
	}
	next := l.clone()
	next.Generation++
	for target, item := range faults {
		next.Services[target] = item
	}
	next.Services["analytics"] = Item{Revision: "healthy-v1"}
	if body.Distractor {
		next.Services["analytics"] = Item{"unrelated-fault-v1", "unrelated"}
	}
	if err := l.save(next); err != nil {
		respond(w, 500, map[string]string{"error": "Could not persist injection"})
		return
	}
	respond(w, 200, map[string]any{"generation": next.Generation, "scenario": body.Scenario, "source": "owned:go-lab/scenario-controller"})
}
func main() {
	port := flag.Int("port", 8865, "First loopback port")
	path := flag.String("state", "lab.json", "Persisted state")
	watch := flag.Bool("watch-parent", false, "Stop on parent pipe EOF")
	flag.Parse()
	if *port < 1024 || *port > 65530 {
		log.Fatal("Invalid port")
	}
	l := &Lab{path: *path, port: *port, token: os.Getenv("GRAPHOPS_LAB_TOKEN"), client: &http.Client{Timeout: 2 * time.Second}}
	if l.token == "" {
		log.Fatal("GRAPHOPS_LAB_TOKEN required")
	}
	if err := os.MkdirAll(filepath.Dir(*path), 0700); err != nil {
		log.Fatal(err)
	}
	b, err := os.ReadFile(*path)
	if err == nil {
		if err = json.Unmarshal(b, &l.state); err != nil {
			log.Fatal(err)
		}
	} else if errors.Is(err, os.ErrNotExist) {
		l.state = State{Services: map[string]Item{}, Operations: map[string]Effect{}}
		for _, name := range names {
			l.state.Services[name] = Item{Revision: "healthy-v1"}
		}
		if err = l.save(l.state); err != nil {
			log.Fatal(err)
		}
	} else {
		log.Fatal(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if *watch {
		go func() { _, _ = io.Copy(io.Discard, os.Stdin); stop() }()
	}
	servers := []*http.Server{}
	listeners := []net.Listener{}
	for offset := 0; offset < 5; offset++ {
		listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port+offset))
		if err != nil {
			for _, old := range listeners {
				old.Close()
			}
			log.Fatal(err)
		}
		listeners = append(listeners, listener)
	}
	for offset, listener := range listeners {
		var handler http.Handler = http.HandlerFunc(l.control)
		if offset < 4 {
			handler = l.service(names[offset])
		}
		s := &http.Server{Handler: handler, ReadHeaderTimeout: 3 * time.Second, ReadTimeout: 5 * time.Second, WriteTimeout: 5 * time.Second, IdleTimeout: 30 * time.Second}
		servers = append(servers, s)
		go func(s *http.Server, n net.Listener) {
			if err := s.Serve(n); err != nil && !errors.Is(err, http.ErrServerClosed) {
				log.Print(err)
				stop()
			}
		}(s, listener)
	}
	log.Printf("GraphOps Go lab ready on loopback ports %d-%d", *port, *port+4)
	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	for _, s := range servers {
		_ = s.Shutdown(shutdown)
	}
}
