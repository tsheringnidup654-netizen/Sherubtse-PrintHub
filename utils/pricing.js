/**
 * Server-side price calculation. The server is the single source of truth:
 * the browser only previews prices by calling GET /api/price, and the cart /
 * checkout always re-price every line from the CURRENT service prices.
 *
 * Settings (strings from the settings table):
 *   a3_multiplier, hq_multiplier, duplex_discount (%), urgent_surcharge_pct (%)
 */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const nu = (n) => `Nu ${round2(n).toFixed(2)}`;

const BINDING_SLUG = { spiral: 'spiral-binding', project: 'project-binding' };

/**
 * Price one item.
 * @param service  service row (pricing_type, base_price, colour_price, ...)
 * @param item     { pages, copies, paper_size, colour_mode, sided, quality, binding }
 * @param ctx      { settings, services }  (services = all services, used to look up binding prices)
 * @returns { total, unit, pages, copies, bindingCost, lines[] }  - `lines` explains the calculation
 */
function calculateItem(service, item, ctx) {
  const s = ctx.settings;
  const copies = Math.max(1, parseInt(item.copies, 10) || 1);
  const type = service.pricing_type;
  const pages = type === 'per_set' ? Math.max(1, parseInt(item.pages, 10) || 1) : Math.max(1, parseInt(item.pages, 10) || 1);
  const lines = [];
  let unit = Number(service.base_price);
  let total;

  if (type === 'per_set') {
    total = unit * copies;
    lines.push(`${copies} × ${nu(unit)} ${service.unit_label}`);
    return { total: round2(total), unit: round2(unit), pages, copies, bindingCost: 0, lines };
  }

  const colour = type === 'print' && item.colour_mode === 'colour' && service.colour_price != null;
  if (colour) unit = Number(service.colour_price);
  lines.push(`${colour ? 'Colour' : 'Standard'} rate ${nu(unit)} per page`);

  if (item.paper_size === 'A3') { unit *= Number(s.a3_multiplier); lines.push(`A3 paper × ${Number(s.a3_multiplier)}`); }
  if (type === 'print') {
    if (item.quality === 'high') { unit *= Number(s.hq_multiplier); lines.push(`High quality × ${Number(s.hq_multiplier)}`); }
    if (item.sided === 'double') {
      const off = Number(s.duplex_discount);
      unit *= 1 - off / 100;
      lines.push(`Double-sided −${off}%`);
    }
  }
  total = unit * pages * copies;
  lines.push(`${pages} page${pages > 1 ? 's' : ''} × ${copies} cop${copies > 1 ? 'ies' : 'y'} × ${nu(unit)} = ${nu(total)}`);

  let bindingCost = 0;
  if (type === 'print' && item.binding && item.binding !== 'none') {
    const b = (ctx.services || []).find((x) => x.slug === BINDING_SLUG[item.binding]);
    if (b) {
      bindingCost = Number(b.base_price) * copies;
      total += bindingCost;
      lines.push(`${b.name}: ${copies} × ${nu(b.base_price)} = ${nu(bindingCost)}`);
    }
  }
  return { total: round2(total), unit: round2(unit), pages, copies, bindingCost: round2(bindingCost), lines };
}

/** Urgent printing surcharge for a subtotal. */
const urgentFee = (subtotal, settings) => round2(Number(subtotal) * (Number(settings.urgent_surcharge_pct) / 100));

module.exports = { calculateItem, urgentFee, round2 };
