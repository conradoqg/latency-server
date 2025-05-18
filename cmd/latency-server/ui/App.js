import { html } from 'htm/preact';
import { useState, useEffect, useRef } from 'preact/hooks';

/**
 * App component: root of the Timming UI.
 * Renders toast notifications, navigation bar, tabs, and page views based on the activeTab state.
 * Utilizes Preact and HTM for component rendering.
 */
export default function App() {
  const [method, setMethod] = useState('REST');
  const [freq, setFreq] = useState(1000);  // 0 = as fast as possible
  const [range, setRange] = useState(60000); // milliseconds, default last 1 minute
  // running controls whether pings are active
  const [running, setRunning] = useState(true);
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const dataPoints = useRef([]);
  // Page suffix from environment (injected via index.html)
  const pageSuffix = window.PAGE_SUFFIX ? ' ' + window.PAGE_SUFFIX : '';
  // Base path for API and WS endpoints, based on where this UI is served
  const basePath = (() => {
    let p = window.location.pathname;
    // ensure a trailing slash
    if (!p.endsWith('/')) {
      p = p.substring(0, p.lastIndexOf('/') + 1);
    }
    return p;
  })();

  // Initialize chart on mount
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Latency (ms)',
          data: [],
          borderColor: 'rgb(75, 192, 192)',
          tension: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            display: true,
            title: { display: true, text: 'Time' }
          },
          y: {
            display: true,
            title: { display: true, text: 'Latency (ms)' }
          }
        }
      }
    });
  }, []);

  // Recording latency and maintaining data within selected range
  const recordLatency = (rtt) => {
    const now = Date.now();
    // append
    dataPoints.current.push({ t: now, rtt });
    // prune old points beyond range
    const cutoff = now - range;
    dataPoints.current = dataPoints.current.filter(p => p.t >= cutoff);
    const chart = chartRef.current;
    if (!chart) return;
    // update chart data
    chart.data.labels = dataPoints.current.map(p => new Date(p.t).toLocaleTimeString());
    chart.data.datasets[0].data = dataPoints.current.map(p => p.rtt);
    chart.update();
  };

  // Handle ping loop: REST or WebSocket, with optional ASAP mode (freq=0)
  useEffect(() => {
    let timer;
    let ws;
    let reconnectTimer;
    let canceled = false;
    // if not running, skip ping loop
    if (!running) return;

    if (method === 'REST') {
      const callREST = () => {
        const start = Date.now();
        fetch(`${basePath}api/latency`)
          .then(res => res.json())
          .then(() => {
            const rtt = Date.now() - start;
            recordLatency(rtt);
          })
          .catch(() => { })
          .finally(() => {
            if (!canceled && freq === 0) callREST();
          });
      };
      if (freq === 0) {
        callREST();
      } else {
        timer = setInterval(() => {
          const start = Date.now();
          fetch(`${basePath}api/latency`)
            .then(res => res.json())
            .then(() => recordLatency(Date.now() - start))
            .catch(() => { });
        }, freq);
      }
    } else if (method === 'WS') {
      const protocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
      const wsUrl = `${protocol}//${location.host}${basePath}ws/latency`;
      // Function to establish and re-establish WebSocket connection
      const connectWS = () => {
        if (canceled) return;
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          if (freq === 0) ws.send(JSON.stringify({ t: Date.now() }));
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            const rtt = Date.now() - msg.t;
            recordLatency(rtt);
          } catch { }
          if (freq === 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ t: Date.now() }));
          }
        };
        ws.onclose = () => {
          if (!canceled) reconnectTimer = setTimeout(connectWS, 1000);
        };
        ws.onerror = () => {
          ws.close();
        };
      };
      connectWS();
      if (freq > 0) {
        timer = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ t: Date.now() }));
          }
        }, freq);
      }
    }

    return () => {
      canceled = true;
      if (timer) clearInterval(timer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [method, freq, running]);

  // Re-prune and update chart when range changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const now = Date.now();
    dataPoints.current = dataPoints.current.filter(p => p.t >= now - range);
    chart.data.labels = dataPoints.current.map(p => new Date(p.t).toLocaleTimeString());
    chart.data.datasets[0].data = dataPoints.current.map(p => p.rtt);
    chart.update();
  }, [range]);

  return html`
    <div class="container mx-auto p-4">
      <h1 class="text-2xl font-bold mb-4">Latency Server ${pageSuffix}</h1>
      <div class="flex items-center space-x-4 mb-4">
        <div>
          <label class="mr-2 font-medium">Method:</label>
          <select
            class="select select-bordered"
            value=${method}
            onChange=${e => setMethod(e.target.value)}
          >
            <option value="REST">REST</option>
            <option value="WS">WebSocket</option>
          </select>
        </div>
        <div>
          <label class="mr-2 font-medium">Frequency:</label>
          <select
            class="select select-bordered"
            value=${freq}
            onChange=${e => setFreq(Number(e.target.value))}
          >
            <option value=${0}>As fast as possible</option>
            <option value=${1000}>1s</option>
            <option value=${2000}>2s</option>
            <option value=${5000}>5s</option>
            <option value=${10000}>10s</option>
          </select>
        </div>
        <div>
          <label class="mr-2 font-medium">Range:</label>
          <select
            class="select select-bordered"
            value=${range}
            onChange=${e => setRange(Number(e.target.value))}
          >
            <option value=${60000}>1m</option>
            <option value=${300000}>5m</option>
            <option value=${900000}>15m</option>
          </select>
        </div>
        <div class="flex flex-col">
          <label class="font-medium">Control:</label>
          <button class="btn block w-full" onClick=${() => setRunning(r => !r)}>
            ${running ? html`<span class="mdi mdi-pause"></span>` : html`<span class="mdi mdi-play"></span>`}
          </button>
        </div>
      </div>
      <div class="bg-white p-4 rounded shadow">
        <canvas ref=${canvasRef} class="w-full"></canvas>
      </div>
    </div>
  `;
}