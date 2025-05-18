// pingWorker.js
// Dedicated Web Worker to perform REST/WebSocket pings in a background thread.
// Receives configuration messages from the main thread and posts latency results back.

let currentConfig = {
  method: 'REST',
  freq: 1000,
  running: true,
  basePath: '/'
};
let timer = null;
let ws = null;
let reconnectTimer = null;

function clearAll() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

function setup() {
  clearAll();
  if (!currentConfig.running) return;

  if (currentConfig.method === 'REST') {
    // Regular interval-based REST pings
    timer = setInterval(() => {
      const start = Date.now();
      fetch(currentConfig.basePath + 'api/latency')
        .then(res => res.json())
        .then(() => {
          postMessage({ type: 'latency', rtt: Date.now() - start });
        })
        .catch(() => {});
    }, currentConfig.freq);
  } else if (currentConfig.method === 'WS') {
    const protocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
    const wsUrl = `${protocol}${location.host}${currentConfig.basePath}ws/latency`;
    function connectWS() {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const rtt = Date.now() - msg.t;
          postMessage({ type: 'latency', rtt });
        } catch {}
      };
      ws.onclose = () => {
        if (currentConfig.running && currentConfig.method === 'WS') {
          reconnectTimer = setTimeout(connectWS, 1000);
        }
      };
      ws.onerror = () => {
        if (ws) ws.close();
      };
    }
    connectWS();
    // Interval-based WebSocket pings
    timer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: Date.now() }));
      }
    }, currentConfig.freq);
  }
}

self.addEventListener('message', (e) => {
  const data = e.data;
  if (data && data.type === 'config') {
    currentConfig = {
      method: data.method,
      freq: data.freq,
      running: data.running,
      basePath: data.basePath
    };
    setup();
  }
});