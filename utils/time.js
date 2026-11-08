/**
 * Date/time helpers. Everything shown to users uses Bhutan Standard Time
 * (Asia/Thimphu, UTC+6, no daylight saving). Deadlines are stored as TIMESTAMPTZ.
 */
const TZ = 'Asia/Thimphu';

function parts(date, opts) {
  const out = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).formatToParts(new Date(date)).forEach((p) => { out[p.type] = p.value; });
  return out;
}

const fmt = (date, opts) => (date ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).format(new Date(date)) : '—');

const time12 = (d) => fmt(d, { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();

/** "11 Nov 2026" */
const fmtDate = (d) => fmt(d, { day: 'numeric', month: 'short', year: 'numeric' });

/** "11 Nov 2026, 2:00 PM" */
const fmtShort = (d) => (d ? `${fmtDate(d)}, ${time12(d)}` : '—');

/** "Wednesday, 11 November 2026 – 2:00 PM" */
function fmtFull(d) {
  if (!d) return '—';
  const p = parts(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `${p.weekday}, ${p.day} ${p.month} ${p.year} – ${time12(d)}`;
}

/** "Wednesday" (day of the week in Bhutan). Accepts a Date or a "YYYY-MM-DD" string. */
function dayName(d) {
  if (!d) return '';
  const date = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00+06:00`) : d;
  return fmt(date, { weekday: 'long' });
}

/** { date: "YYYY-MM-DD", time: "HH:mm" } in Bhutan wall-clock time - for <input type=date|time>. */
function toInputParts(d) {
  if (!d) return { date: '', time: '' };
  const p = parts(d, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/**
 * Convert Bhutan wall-clock input (date "YYYY-MM-DD" + time "HH:mm") into an absolute Date.
 * Returns null when the input is missing or invalid.
 */
function fromBhutanLocal(dateStr, timeStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '') || !/^\d{2}:\d{2}$/.test(timeStr || '')) return null;
  const d = new Date(`${dateStr}T${timeStr}:00+06:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Human readable duration from minutes: "45 min", "2 h 10 min", "1 day 3 h". */
function fmtDuration(minutes) {
  if (minutes == null) return '—';
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h} h ${rem} min` : `${h} h`;
  const days = Math.floor(h / 24);
  const hrs = h % 24;
  return `${days} day${days > 1 ? 's' : ''}${hrs ? ` ${hrs} h` : ''}`;
}

/**
 * Countdown colour for a deadline:
 *   green   > 24 hours left      yellow  < 24 hours      red  < 3 hours      expired  passed
 * (public/js/countdown.js uses the same thresholds.)
 */
function deadlineState(deadline, now = Date.now()) {
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return 'expired';
  if (ms < 3 * 3600e3) return 'red';
  if (ms < 24 * 3600e3) return 'yellow';
  return 'green';
}

module.exports = { TZ, fmtDate, fmtShort, fmtFull, dayName, toInputParts, fromBhutanLocal, fmtDuration, deadlineState };
