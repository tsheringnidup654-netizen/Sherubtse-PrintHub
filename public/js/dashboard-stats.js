/* Refresh admin dashboard metrics and charts without reloading the page. */
(function () {
  'use strict';
  const root = document.querySelector('[data-dashboard-stats-url]');
  if (!root) return;

  const status = document.querySelector('[data-dashboard-updated]');
  const chartData = {
    daily: (stats) => stats.daily,
    monthly: (stats) => stats.monthly,
    popular: (stats) => stats.popular,
  };

  function showStatus(message, failed) {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('text-danger', failed);
    status.classList.toggle('text-muted', !failed);
  }

  function updateDashboard(stats) {
    if (!stats || !stats.counts || !Array.isArray(stats.daily)
      || !Array.isArray(stats.monthly) || !Array.isArray(stats.popular)) {
      throw new Error('Dashboard stats response is invalid.');
    }

    const values = { ...stats.counts, sales: stats.sales };
    document.querySelectorAll('[data-dashboard-stat]').forEach((element) => {
      const value = Number(values[element.dataset.dashboardStat]);
      if (!Number.isFinite(value)) return;
      element.textContent = element.dataset.dashboardStat === 'sales'
        ? 'Nu ' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : value.toLocaleString('en-US');
    });

    document.querySelectorAll('canvas[data-dashboard-chart]').forEach((canvas) => {
      const chart = window.Chart && window.Chart.getChart(canvas);
      const rows = chartData[canvas.dataset.dashboardChart](stats);
      if (!chart || !rows) return;
      chart.data.labels = rows.map((row) => row.label);
      chart.data.datasets[0].data = rows.map((row) => Number(row.value));
      chart.update();
    });
  }

  let refreshing = false;
  async function refresh() {
    if (document.hidden || refreshing) return;
    refreshing = true;
    try {
      const response = await fetch(root.dataset.dashboardStatsUrl, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Dashboard stats request failed (${response.status}).`);
      updateDashboard(await response.json());
      showStatus(`Updated automatically at ${new Date().toLocaleTimeString()}.`, false);
    } catch (error) {
      showStatus('Live update failed; showing the last loaded data.', true);
      console.error(error);
    } finally {
      refreshing = false;
    }
  }

  refresh();
  window.setInterval(refresh, 5000);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('focus', refresh);
})();
