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

  // Use a Web Worker to run ping loops in a background thread to avoid timer throttling
  const workerRef = useRef(null);

  // Spawn the worker on mount
  useEffect(() => {
    const w = new Worker(`${basePath}pingWorker.js`, { type: 'module' });
    workerRef.current = w;
    w.onmessage = (e) => {
      const msg = e.data;
      if (msg && msg.type === 'latency') {
        recordLatency(msg.rtt);
      }
    };
    // send initial configuration
    w.postMessage({ type: 'config', method, freq, running, basePath });
    return () => {
      w.terminate();
    };
  }, [basePath]);

  // Update worker whenever settings change
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'config', method, freq, running, basePath });
    }
  }, [method, freq, running, basePath]);

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