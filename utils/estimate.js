/**
 * Estimated waiting time. This is only an ESTIMATE based on the current queue
 * and the admin-configured throughput; a real completion time is promised only
 * when the administrator sets `estimated_completion` on the order.
 */
const { fmtDuration } = require('./time');

/**
 * @param {number} queuePages   pages already waiting (pending/accepted/printing orders)
 * @param {number} orderPages   pages in the new order
 * @param {number} pagesPerHour shop throughput
 */
function estimateProcessing(queuePages, orderPages, pagesPerHour) {
  const pph = Math.max(1, Number(pagesPerHour) || 300);
  const minutes = ((queuePages + orderPages) / pph) * 60 + 10; // +10 min handling buffer
  const low = Math.max(10, Math.round(minutes * 0.8));
  const high = Math.round(minutes * 1.3);
  const busy = queuePages > pph * 2 ? 'busy' : queuePages > pph / 2 ? 'moderate' : 'quiet';
  return {
    minutes: Math.round(minutes),
    label: `${fmtDuration(low)} – ${fmtDuration(high)}`,
    workload: busy,
    queuePages,
  };
}

module.exports = { estimateProcessing };
