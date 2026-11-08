/* Chart.js initialisation. Each <canvas data-chart='{"type":"bar","labels":[...],"values":[...],"label":"...","money":true}'> is rendered. */
(function () {
  'use strict';
  if (!window.Chart) return;
  const NAVY = '#0b2a5b', SKY = '#4da3ff';
  const PALETTE = ['#0b2a5b', '#4da3ff', '#13408a', '#8cc4ff', '#2f6fd1', '#b7d8ff'];
  Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
  Chart.defaults.color = '#6b7690';

  document.querySelectorAll('canvas[data-chart]').forEach((cv) => {
    let cfg;
    try { cfg = JSON.parse(cv.dataset.chart); } catch (_) { return; }
    const isDonut = cfg.type === 'doughnut';
    const fmt = (v) => (cfg.money ? 'Nu ' + Number(v).toLocaleString('en-US') : v);
    new Chart(cv, {
      type: cfg.type,
      data: {
        labels: cfg.labels,
        datasets: [{
          label: cfg.label || '',
          data: cfg.values,
          backgroundColor: isDonut ? PALETTE : cfg.type === 'line' ? 'rgba(77,163,255,.18)' : NAVY,
          borderColor: cfg.type === 'line' ? SKY : undefined,
          borderWidth: cfg.type === 'line' ? 3 : 0,
          fill: cfg.type === 'line', tension: .35, pointRadius: cfg.type === 'line' ? 3 : 0,
          borderRadius: cfg.type === 'bar' ? 8 : 0, maxBarThickness: 36,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: isDonut, position: 'bottom' }, tooltip: { callbacks: { label: (c) => ' ' + fmt(c.parsed.y ?? c.parsed) } } },
        scales: isDonut ? {} : { y: { beginAtZero: true, ticks: { callback: (v) => fmt(v), precision: 0 }, grid: { color: '#eef2f8' } }, x: { grid: { display: false } } },
      },
    });
  });
})();
