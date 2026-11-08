/**
 * Generates the invoice / receipt PDF for an order (PDFKit).
 */
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { fmtFull, fmtShort } = require('./time');
const { optionSummary } = require('./helpers');
const { STATUS_LABELS } = require('../config/constants');

const NAVY = '#0b2a5b';
const nu = (n) => `Nu ${Number(n).toFixed(2)}`;

async function buildInvoice({ order, items, payment, student, settings, qrUrl }, stream) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Invoice ${order.order_number}` } });
  doc.pipe(stream);

  // Header band
  doc.rect(0, 0, doc.page.width, 96).fill(NAVY);
  try { doc.image(path.join(__dirname, '..', 'public', 'img', 'logo.png'), 48, 18, { height: 60 }); } catch (_) { /* logo optional */ }
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(20).text(settings.shop_name || 'Sherubtse PrintHub', 130, 26);
  doc.font('Helvetica').fontSize(9).text(settings.shop_location || '', 130, 52).text(`${settings.shop_phone || ''}  |  ${settings.shop_email || ''}`, 130, 65);
  doc.font('Helvetica-Bold').fontSize(14).text('INVOICE', 0, 34, { align: 'right', width: doc.page.width - 48 });

  // Meta
  doc.fillColor('#000').fontSize(10);
  let y = 120;
  doc.font('Helvetica-Bold').text('Order ID', 48, y).font('Helvetica').text(order.order_number, 130, y);
  doc.font('Helvetica-Bold').text('Order date', 48, y + 16).font('Helvetica').text(fmtShort(order.created_at), 130, y + 16);
  doc.font('Helvetica-Bold').text('Collection', 48, y + 32).font('Helvetica').text(fmtFull(order.collection_deadline), 130, y + 32);
  doc.font('Helvetica-Bold').text('Status', 48, y + 48).font('Helvetica').text(STATUS_LABELS[order.status], 130, y + 48);

  doc.font('Helvetica-Bold').text('Billed to', 340, y).font('Helvetica')
    .text(student.full_name, 340, y + 16).text(student.student_id ? `Student ID: ${student.student_id}` : '', 340, y + 32)
    .text(student.email, 340, y + 48).text(student.programme || '', 340, y + 64);

  // Items table
  y = 215;
  doc.rect(48, y, 500, 22).fill(NAVY);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9)
    .text('Service / specification', 54, y + 7).text('Pages', 330, y + 7, { width: 40, align: 'right' })
    .text('Copies', 372, y + 7, { width: 40, align: 'right' }).text('Amount', 450, y + 7, { width: 92, align: 'right' });
  y += 28;
  doc.fillColor('#000').font('Helvetica').fontSize(9);
  items.forEach((it) => {
    doc.font('Helvetica-Bold').text(it.service_name, 54, y, { width: 270 });
    doc.font('Helvetica').fillColor('#555').text(optionSummary(it), 54, doc.y, { width: 270 });
    if (it.instructions) doc.text(`Note: ${it.instructions}`, 54, doc.y, { width: 270 });
    const bottom = doc.y;
    doc.fillColor('#000').text(String(it.pages), 330, y, { width: 40, align: 'right' })
      .text(String(it.copies), 372, y, { width: 40, align: 'right' })
      .text(nu(it.line_total), 450, y, { width: 92, align: 'right' });
    y = bottom + 10;
    doc.moveTo(48, y - 4).lineTo(548, y - 4).strokeColor('#e3e8ef').stroke();
  });

  // Totals
  y += 6;
  const row = (label, val, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor('#000')
      .text(label, 340, y, { width: 100 }).text(val, 440, y, { width: 102, align: 'right' });
    y += bold ? 22 : 16;
  };
  row('Subtotal', nu(order.subtotal));
  if (Number(order.urgent_fee) > 0) row('Urgent fee', nu(order.urgent_fee));
  row('Total', nu(order.total), true);

  // Payment
  y += 6;
  doc.font('Helvetica-Bold').fontSize(10).text('Payment', 48, y);
  doc.font('Helvetica').text(`Method: ${payment ? payment.method : '—'}   |   Status: ${payment ? payment.status.toUpperCase() : '—'}${payment && payment.reference ? `   |   Ref: ${payment.reference}` : ''}`, 48, y + 14);

  // QR
  if (qrUrl && ['pending', 'accepted', 'printing', 'ready'].includes(order.status)) {
    const png = await QRCode.toBuffer(qrUrl, { margin: 1, width: 200 });
    doc.image(png, 448, doc.page.height - 190, { width: 96 });
    doc.fontSize(8).fillColor('#555').text('Show this QR code at collection', 430, doc.page.height - 90, { width: 130, align: 'center' });
  }
  doc.fontSize(8).fillColor('#888').text('Thank you for using Sherubtse PrintHub — Print Smart. Save Time. Collect with Ease.', 48, doc.page.height - 60, { align: 'center', width: 500 });
  doc.end();
}

module.exports = { buildInvoice };
