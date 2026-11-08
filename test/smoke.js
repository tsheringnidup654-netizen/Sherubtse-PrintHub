/**
 * End-to-end smoke test: starts the real app on a random port, uses the real PostgreSQL database
 * and walks through the main student and admin workflows over HTTP.
 *
 *   npm run db:setup   (fresh sample data)
 *   npm test
 *
 * It creates a few extra rows (a new student, a document, orders) - re-run db:setup to reset.
 */
require('dotenv').config();
const assert = require('assert');
const http = require('http');
const app = require('../app');
const db = require('../config/db');

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); } catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${e.message}`); }
}

/** Tiny HTTP client with a cookie jar and automatic CSRF token handling. */
function makeClient(base) {
  const jar = new Map();
  let csrf = '';
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  async function request(method, path, { form, multipart, json, headers = {}, follow = false } = {}) {
    const h = { ...headers, cookie: cookieHeader() };
    let body;
    if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams({ _csrf: csrf, ...form }).toString(); }
    if (multipart) { multipart.append('_csrf', csrf); body = multipart; h['x-csrf-token'] = csrf; }
    if (json) { h['content-type'] = 'application/json'; body = JSON.stringify(json); h['x-csrf-token'] = csrf; }
    const res = await fetch(base + path, { method, headers: h, body, redirect: follow ? 'follow' : 'manual' });
    (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach((c) => { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); });
    const buf = Buffer.from(await res.arrayBuffer());
    const text = res.headers.get('content-type') && /text|json|html/.test(res.headers.get('content-type')) ? buf.toString('utf8') : '';
    const m = text.match(/data-csrf="([^"]+)"/);
    if (m) csrf = m[1];
    return { status: res.status, headers: res.headers, text, buf, location: res.headers.get('location') };
  }
  return {
    get: (p, o) => request('GET', p, o),
    post: (p, form, o) => request('POST', p, { form, ...o }),
    postRaw: (p, o) => request('POST', p, o),
    csrf: () => csrf,
  };
}

const tiny = (pages) => {
  // minimal valid multi-page PDF
  let objs = '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n';
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i} 0 R`).join(' ');
  objs += `2 0 obj<</Type/Pages/Kids[${kids}]/Count ${pages}>>endobj\n`;
  for (let i = 0; i < pages; i += 1) objs += `${3 + i} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n`;
  return Buffer.from(`%PDF-1.4\n${objs}trailer<</Root 1 0 R>>\n%%EOF`);
};

(async () => {
  const server = http.createServer(app).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const guest = makeClient(base);
  const student = makeClient(base);
  const other = makeClient(base);
  const admin = makeClient(base);
  const stamp = Date.now();
  const myEmail = `t${stamp}.sherubtse@rub.edu.bt`;

  console.log('\nPublic pages');
  for (const p of ['/', '/about', '/services', '/services?q=binding', '/contact', '/login', '/register']) {
    await test(`GET ${p} -> 200`, async () => assert.strictEqual((await guest.get(p)).status, 200));
  }
  await test('unknown page -> 404', async () => assert.strictEqual((await guest.get('/nope')).status, 404));
  await test('home page shows the Sherubtse logo and tagline', async () => {
    const r = await guest.get('/');
    assert.ok(r.text.includes('/img/logo.png') && r.text.includes('Collect with Ease'));
  });
  await test('price API calculates on the server', async () => {
    const r = await guest.get('/api/price?service=1&pages=10&copies=2&paper_size=A4&colour_mode=bw&sided=single&quality=normal&binding=none');
    const d = JSON.parse(r.text);
    assert.ok(d.ok); assert.strictEqual(d.total, 40); // 10 pages x 2 copies x Nu 2
  });
  await test('price API: A3 + double-sided + spiral binding', async () => {
    const d = JSON.parse((await guest.get('/api/price?service=1&pages=10&copies=1&paper_size=A3&sided=double&binding=spiral')).text);
    assert.strictEqual(d.total, 10 * 2 * 2 * 0.9 + 40); // 36 + 40 binding
  });
  await test('price API rejects invalid input', async () => assert.strictEqual((await guest.get('/api/price?service=1&pages=0&copies=1')).status, 422));
  await test('contact form saves a message', async () => {
    await guest.get('/contact');
    const r = await guest.post('/contact', { name: 'Tester', email: 'a@b.co', subject: 'Hello', message: 'This is a test message.' });
    assert.strictEqual(r.status, 302);
  });

  console.log('\nSecurity');
  await test('POST without CSRF token is rejected (403)', async () => {
    const r = await fetch(`${base}/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
    assert.strictEqual(r.status, 403);
  });
  await test('protected pages redirect guests to /login', async () => {
    for (const p of ['/student/dashboard', '/student/orders', '/admin/dashboard']) {
      const r = await guest.get(p);
      assert.strictEqual(r.status, 302); assert.strictEqual(r.location, '/login');
    }
  });
  await test('wrong password is refused', async () => {
    await guest.get('/login');
    const r = await guest.post('/login', { email: '02230001.sherubtse@rub.edu.bt', password: 'wrong' });
    assert.strictEqual(r.status, 401);
  });
  await test('SQL injection in login does not log in', async () => {
    const r = await guest.post('/login', { email: "' OR 1=1 --", password: "' OR 1=1 --" });
    assert.strictEqual(r.status, 401);
  });

  console.log('\nRegistration & login');
  await test('registration validates input', async () => {
    await guest.get('/register');
    const r = await guest.post('/register', { full_name: 'x', email: 'bad', password: '123', confirm_password: '1' });
    assert.strictEqual(r.status, 400); assert.ok(r.text.includes('Please enter your full name'));
  });
  await test('new student can register (and is logged in)', async () => {
    await student.get('/register');
    const r = await student.post('/register', { full_name: 'Test Student', email: myEmail, student_id: `T${String(stamp).slice(-7)}`, password: 'Secret123', confirm_password: 'Secret123', phone: '17123456', programme: 'BSc Test' });
    assert.strictEqual(r.status, 302); assert.strictEqual(r.location, '/student/dashboard');
  });
  await test('duplicate e-mail is refused', async () => {
    const c = makeClient(base); await c.get('/register');
    const r = await c.post('/register', { full_name: 'Dup Student', email: myEmail, password: 'Secret123', confirm_password: 'Secret123' });
    assert.strictEqual(r.status, 400); assert.ok(r.text.includes('already exists'));
  });
  await test('seeded student logs in', async () => {
    await other.get('/login');
    const r = await other.post('/login', { email: '02230002.sherubtse@rub.edu.bt', password: 'Student@123' });
    assert.strictEqual(r.status, 302);
  });

  console.log('\nStudent pages');
  for (const p of ['/student/dashboard', '/student/profile', '/student/documents', '/student/customize', '/student/customize?service=colour-printing',
    '/student/cart', '/student/orders', '/student/orders?status=pending&q=SH', '/student/notifications', '/student/history', '/student/feedback']) {
    await test(`GET ${p} -> 200`, async () => assert.strictEqual((await student.get(p)).status, 200));
  }
  await test('student cannot open admin area (403)', async () => assert.strictEqual((await student.get('/admin/dashboard')).status, 403));

  console.log('\nDocument upload');
  let docId;
  await test('uploads a valid PDF and detects its page count', async () => {
    const fd = new FormData(); fd.append('document', new Blob([tiny(7)], { type: 'application/pdf' }), 'My Report.pdf');
    const r = await student.postRaw('/student/documents', { multipart: fd, headers: { accept: 'application/json' } });
    const d = JSON.parse(r.text); assert.ok(d.ok, r.text); assert.strictEqual(d.document.pages, 7); docId = d.document.id;
  });
  await test('rejects a disallowed file type', async () => {
    const fd = new FormData(); fd.append('document', new Blob(['hello'], { type: 'text/plain' }), 'notes.txt');
    const r = await student.postRaw('/student/documents', { multipart: fd, headers: { accept: 'application/json' } });
    assert.strictEqual(r.status, 400);
  });
  await test('rejects a fake PDF (content does not match extension)', async () => {
    const fd = new FormData(); fd.append('document', new Blob(['not really a pdf'], { type: 'application/pdf' }), 'fake.pdf');
    const r = await student.postRaw('/student/documents', { multipart: fd, headers: { accept: 'application/json' } });
    assert.strictEqual(r.status, 400); assert.ok(JSON.parse(r.text).error.includes('does not match'));
  });
  await test('owner can open own document', async () => {
    const r = await student.get(`/student/documents/${docId}/file`);
    assert.strictEqual(r.status, 200); assert.ok(r.buf.slice(0, 4).toString() === '%PDF');
  });
  await test("another student CANNOT open this document (404)", async () => assert.strictEqual((await other.get(`/student/documents/${docId}/file`)).status, 404));
  await test('guest cannot open the document', async () => assert.strictEqual((await guest.get(`/student/documents/${docId}/file`)).status, 302));
  await test('uploads folder is not served statically', async () => assert.strictEqual((await guest.get('/uploads/documents/')).status, 404));

  console.log('\nCart, checkout & order');
  let orderId; let orderNumber;
  await test('add to cart (server validates and prices)', async () => {
    const r = await student.post('/student/cart', { service_id: 1, document_id: docId, pages: 7, copies: 3, paper_size: 'A4', colour_mode: 'bw', sided: 'double', orientation: 'portrait', quality: 'normal', binding: 'spiral', instructions: 'Staple please' });
    assert.strictEqual(r.status, 302);
    const cart = await student.get('/student/cart');
    // 7*3*2*0.9 = 37.80 + 3 spiral * 40 = 120 -> 157.80
    assert.ok(cart.text.includes('157.80'), 'cart total should be Nu 157.80');
  });
  await test('cart rejects invalid copies', async () => {
    const r = await student.post('/student/cart', { service_id: 1, pages: 5, copies: 0 });
    assert.strictEqual(r.status, 302); assert.strictEqual(r.location, '/student/customize?service=bw-printing');
  });
  await test('checkout page shows deadline picker and day of week', async () => {
    const r = await student.get('/student/checkout');
    assert.strictEqual(r.status, 200); assert.ok(r.text.includes('deadline_date') && r.text.includes('day-name'));
  });
  await test('checkout rejects a deadline in the past', async () => {
    const r = await student.post('/student/checkout', { deadline_date: '2020-01-01', deadline_time: '10:00', payment_method: 'cash' });
    assert.strictEqual(r.status, 400); assert.ok(r.text.includes('at least'));
  });
  const deadlineLocal = new Date(Date.now() + 50 * 3600e3 + 6 * 3600e3); // +50h, expressed as Bhutan wall-clock
  const dDate = deadlineLocal.toISOString().slice(0, 10); const dTime = deadlineLocal.toISOString().slice(11, 16);
  await test('place an order with an urgent request', async () => {
    const r = await student.post('/student/checkout', { deadline_date: dDate, deadline_time: dTime, payment_method: 'cash', urgent: 'on', notes: 'Thanks!' });
    assert.strictEqual(r.status, 302, r.text.slice(0, 200));
    orderId = Number(r.location.split('/').pop());
    const { rows } = await db.query('SELECT * FROM orders WHERE id=$1', [orderId]);
    orderNumber = rows[0].order_number;
    assert.ok(/^SH\d{4}\d{3}$/.test(orderNumber), orderNumber);
    assert.strictEqual(rows[0].urgent_status, 'requested');
    assert.strictEqual(Number(rows[0].subtotal), 157.8); assert.strictEqual(Number(rows[0].urgent_fee), 39.45); assert.strictEqual(Number(rows[0].total), 197.25);
    // the stored deadline is exactly the Bhutan time the student picked
    assert.strictEqual(rows[0].collection_deadline.toISOString(), new Date(`${dDate}T${dTime}:00+06:00`).toISOString());
  });
  await test('cart is emptied after ordering', async () => assert.ok((await student.get('/student/cart')).text.includes('Your cart is empty')));
  await test('order page: countdown uses the stored deadline, tracker, timeline, QR', async () => {
    const r = await student.get(`/student/orders/${orderId}`);
    const { rows } = await db.query('SELECT collection_deadline FROM orders WHERE id=$1', [orderId]);
    assert.strictEqual(r.status, 200);
    assert.ok(r.text.includes(`data-deadline="${rows[0].collection_deadline.toISOString()}"`));
    assert.ok(r.text.includes('class="tracker"') && r.text.includes('timeline') && r.text.includes(`/student/orders/${orderId}/qr`));
    assert.ok(r.text.includes('Not confirmed yet'), 'no completion promised before admin confirms');
  });
  await test('QR code image is a PNG', async () => {
    const r = await student.get(`/student/orders/${orderId}/qr`);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get('content-type'), 'image/png'); assert.strictEqual(r.buf[1], 0x50);
  });
  await test('invoice PDF downloads', async () => {
    const r = await student.get(`/student/orders/${orderId}/receipt`);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.buf.slice(0, 4).toString(), '%PDF');
  });
  await test("another student cannot see this order (404)", async () => assert.strictEqual((await other.get(`/student/orders/${orderId}`)).status, 404));
  await test("another student cannot cancel it (404)", async () => assert.strictEqual((await other.post(`/student/orders/${orderId}/cancel`, {})).status, 404));
  await test('document in an active order cannot be deleted', async () => {
    await student.post(`/student/documents/${docId}/delete`, {});
    const { rows } = await db.query('SELECT 1 FROM documents WHERE id=$1', [docId]); assert.strictEqual(rows.length, 1);
  });

  console.log('\nAdmin');
  await test('admin logs in', async () => {
    await admin.get('/login');
    const r = await admin.post('/login', { email: 'admin@sherubtse.edu.bt', password: 'Admin@123' });
    assert.strictEqual(r.status, 302); assert.strictEqual(r.location, '/admin/dashboard');
  });
  for (const p of ['/admin/dashboard', '/admin/notifications', '/admin/students', '/admin/students?q=pema', '/admin/services', '/admin/orders', '/admin/orders?sort=deadline',
    '/admin/orders?status=pending&deadline=upcoming', `/admin/orders/${orderId}`, '/admin/documents', '/admin/deadlines', '/admin/payments', '/admin/payments?status=pending',
    '/admin/feedback', '/admin/reports', '/admin/collect']) {
    await test(`GET ${p} -> 200`, async () => assert.strictEqual((await admin.get(p)).status, 200));
  }
  await test('admin can open any student document', async () => assert.strictEqual((await admin.get(`/admin/documents/${docId}/file`)).status, 200));
  await test('CSV report downloads', async () => {
    const r = await admin.get('/admin/reports/export.csv');
    assert.strictEqual(r.status, 200); assert.ok(r.text.startsWith('Order,Student'));
  });
  await test('invoice PDF for any order', async () => assert.strictEqual((await admin.get(`/admin/orders/${orderId}/invoice`)).buf.slice(0, 4).toString(), '%PDF'));

  console.log('\nOrder workflow');
  await test('cannot skip straight to "ready"', async () => {
    await admin.post(`/admin/orders/${orderId}/status`, { status: 'ready' });
    const { rows } = await db.query('SELECT status FROM orders WHERE id=$1', [orderId]); assert.strictEqual(rows[0].status, 'pending');
  });
  await test('admin approves the urgent request', async () => {
    await admin.post(`/admin/orders/${orderId}/urgent`, { decision: 'approve' });
    const { rows } = await db.query('SELECT urgent_status FROM orders WHERE id=$1', [orderId]); assert.strictEqual(rows[0].urgent_status, 'approved');
  });
  await test('admin accepts the order and the student is notified', async () => {
    await admin.post(`/admin/orders/${orderId}/status`, { status: 'accepted' });
    const { rows } = await db.query("SELECT 1 FROM notifications WHERE order_id=$1 AND type='accepted'", [orderId]); assert.strictEqual(rows.length, 1);
  });
  await test('admin sets an estimated completion and a delay notice', async () => {
    const est = new Date(Date.now() + 20 * 3600e3 + 6 * 3600e3);
    await admin.post(`/admin/orders/${orderId}/schedule`, { est_date: est.toISOString().slice(0, 10), est_time: est.toISOString().slice(11, 16), notify_delay: 'on', delay_note: 'Printer maintenance' });
    const { rows } = await db.query('SELECT estimated_completion, is_delayed FROM orders WHERE id=$1', [orderId]);
    assert.ok(rows[0].estimated_completion); assert.strictEqual(rows[0].is_delayed, true);
    const n = await db.query("SELECT 1 FROM notifications WHERE order_id=$1 AND type='delayed'", [orderId]); assert.strictEqual(n.rows.length, 1);
  });
  await test('admin changes the collection deadline', async () => {
    const nd = new Date(Date.now() + 80 * 3600e3 + 6 * 3600e3);
    await admin.post(`/admin/orders/${orderId}/schedule`, { deadline_date: nd.toISOString().slice(0, 10), deadline_time: nd.toISOString().slice(11, 16) });
    const { rows } = await db.query('SELECT collection_deadline FROM orders WHERE id=$1', [orderId]);
    assert.strictEqual(rows[0].collection_deadline.toISOString(), new Date(`${nd.toISOString().slice(0, 10)}T${nd.toISOString().slice(11, 16)}:00+06:00`).toISOString());
  });
  await test('student can no longer cancel once printing starts', async () => {
    await admin.post(`/admin/orders/${orderId}/status`, { status: 'printing' });
    await student.post(`/student/orders/${orderId}/cancel`, {});
    const { rows } = await db.query('SELECT status FROM orders WHERE id=$1', [orderId]); assert.strictEqual(rows[0].status, 'printing');
  });
  await test('collection is refused until the order is ready', async () => {
    const { rows } = await db.query('SELECT qr_token FROM orders WHERE id=$1', [orderId]);
    await admin.post(`/admin/collect/${rows[0].qr_token}`, { via: 'qr' });
    const o = await db.query('SELECT status FROM orders WHERE id=$1', [orderId]); assert.strictEqual(o.rows[0].status, 'printing');
  });
  await test('admin marks the order ready', async () => {
    await admin.post(`/admin/orders/${orderId}/status`, { status: 'ready' });
    const { rows } = await db.query('SELECT status FROM orders WHERE id=$1', [orderId]); assert.strictEqual(rows[0].status, 'ready');
  });
  await test('an expired deadline does NOT change the status', async () => {
    await db.query("UPDATE orders SET collection_deadline = NOW() - INTERVAL '1 hour' WHERE id=$1", [orderId]);
    const page = await student.get(`/student/orders/${orderId}`);
    assert.ok(page.text.includes('state-expired')); assert.ok(page.text.includes('Ready for Collection'));
    const { rows } = await db.query('SELECT status FROM orders WHERE id=$1', [orderId]); assert.strictEqual(rows[0].status, 'ready');
    await db.query("UPDATE orders SET collection_deadline = NOW() + INTERVAL '2 hours' WHERE id=$1", [orderId]);
  });
  await test('deadline notifications are created once (<3h) and never change status', async () => {
    const Notification = require('../models/Notification');
    await Notification.scanDeadlines(); await Notification.scanDeadlines();
    const n = await db.query("SELECT 1 FROM notifications WHERE order_id=$1 AND type='deadline_approaching'", [orderId]);
    assert.strictEqual(n.rows.length, 1);
    const { rows } = await db.query('SELECT status FROM orders WHERE id=$1', [orderId]); assert.strictEqual(rows[0].status, 'ready');
  });
  await test('QR collection page identifies the order and hands it over', async () => {
    const { rows } = await db.query('SELECT qr_token FROM orders WHERE id=$1', [orderId]);
    const page = await admin.get(`/admin/collect/${rows[0].qr_token}`);
    assert.ok(page.text.includes(orderNumber) && page.text.includes('Mark as collected'));
    await admin.post(`/admin/collect/${rows[0].qr_token}`, { via: 'qr' });
    const o = await db.query('SELECT status FROM orders WHERE id=$1', [orderId]); assert.strictEqual(o.rows[0].status, 'collected');
    const rec = await db.query('SELECT 1 FROM collection_records WHERE order_id=$1', [orderId]); assert.strictEqual(rec.rows.length, 1);
    const pay = await db.query("SELECT status FROM payments WHERE order_id=$1", [orderId]); assert.strictEqual(pay.rows[0].status, 'paid');
  });
  await test('manual lookup by order number redirects to the collection page', async () => {
    const r = await admin.get(`/admin/collect?q=${orderNumber}`); assert.strictEqual(r.status, 302); assert.ok(r.location.startsWith('/admin/collect/'));
  });
  await test('status history records every change', async () => {
    const { rows } = await db.query('SELECT status FROM order_status_history WHERE order_id=$1 ORDER BY id', [orderId]);
    assert.ok(['pending', 'accepted', 'printing', 'ready', 'collected'].every((s) => rows.some((r) => r.status === s)));
  });

  console.log('\nFeedback & analytics');
  await test('student reviews the collected order', async () => {
    await student.get('/student/feedback');
    await student.post('/student/feedback', { order_id: orderId, rating: 5, comment: 'Great service' });
    const { rows } = await db.query('SELECT rating FROM feedback WHERE order_id=$1', [orderId]); assert.strictEqual(rows[0].rating, 5);
  });
  await test('cannot review the same order twice', async () => {
    await student.post('/student/feedback', { order_id: orderId, rating: 1, comment: 'again' });
    const { rows } = await db.query('SELECT rating FROM feedback WHERE order_id=$1', [orderId]); assert.strictEqual(rows.length, 1); assert.strictEqual(rows[0].rating, 5);
  });
  await test('admin replies to feedback', async () => {
    const { rows } = await db.query('SELECT id FROM feedback WHERE order_id=$1', [orderId]);
    await admin.post(`/admin/feedback/${rows[0].id}`, { visible: 'true', reply: 'Thank you!' });
    const r = await db.query('SELECT admin_reply FROM feedback WHERE id=$1', [rows[0].id]); assert.strictEqual(r.rows[0].admin_reply, 'Thank you!');
  });
  await test('history page reflects spending', async () => assert.ok((await student.get('/student/history')).text.includes('197.25')));

  console.log('\nCancellation, admin catalogue & payments');
  await test('student places and cancels a second order', async () => {
    await student.post('/student/cart', { service_id: 6, pages: 2, copies: 1, paper_size: 'A4' });
    const t = new Date(Date.now() + 30 * 3600e3 + 6 * 3600e3);
    const r = await student.post('/student/checkout', { deadline_date: t.toISOString().slice(0, 10), deadline_time: t.toISOString().slice(11, 16), payment_method: 'cash' });
    const id = Number(r.location.split('/').pop());
    await student.post(`/student/orders/${id}/cancel`, {});
    const { rows } = await db.query('SELECT status FROM orders WHERE id=$1', [id]); assert.strictEqual(rows[0].status, 'cancelled');
  });
  await test('admin can reject an order only with a reason', async () => {
    const { rows } = await db.query("SELECT id FROM orders WHERE status='pending' ORDER BY id DESC LIMIT 1");
    await admin.post(`/admin/orders/${rows[0].id}/status`, { status: 'rejected' });
    assert.strictEqual((await db.query('SELECT status FROM orders WHERE id=$1', [rows[0].id])).rows[0].status, 'pending');
    await admin.post(`/admin/orders/${rows[0].id}/status`, { status: 'rejected', note: 'Unreadable file' });
    assert.strictEqual((await db.query('SELECT status FROM orders WHERE id=$1', [rows[0].id])).rows[0].status, 'rejected');
  });
  await test('admin updates a service price and the price API follows', async () => {
    await admin.post('/admin/services/1', { category_id: 1, name: 'Black and White Printing', description: 'Crisp black and white laser printing.', pricing_type: 'print', base_price: '3.00', colour_price: '', unit_label: 'per A4 page', options_text: 'x', sort_order: 1, icon: 'bi-file-earmark-text' });
    assert.strictEqual(JSON.parse((await guest.get('/api/price?service=1&pages=10&copies=1')).text).total, 30);
    await admin.post('/admin/services/1', { category_id: 1, name: 'Black and White Printing', description: 'Crisp black and white laser printing.', pricing_type: 'print', base_price: '2.00', colour_price: '', unit_label: 'per A4 page', options_text: 'x', sort_order: 1, icon: 'bi-file-earmark-text' });
  });
  await test('admin can mark a payment as paid', async () => {
    const { rows } = await db.query("SELECT id FROM payments WHERE status='pending' LIMIT 1");
    await admin.post(`/admin/payments/${rows[0].id}`, { status: 'paid', reference: 'TXN123' });
    assert.strictEqual((await db.query('SELECT status FROM payments WHERE id=$1', [rows[0].id])).rows[0].status, 'paid');
  });
  await test('admin can deactivate and re-activate a student', async () => {
    const { rows } = await db.query("SELECT id FROM users WHERE email='02230004.sherubtse@rub.edu.bt'");
    await admin.post(`/admin/students/${rows[0].id}/toggle`, { active: 'false' });
    assert.strictEqual((await db.query('SELECT is_active FROM users WHERE id=$1', [rows[0].id])).rows[0].is_active, false);
    await admin.post(`/admin/students/${rows[0].id}/toggle`, { active: 'true' });
  });

  console.log('\nProfile & logout');
  await test('student updates profile and password', async () => {
    await student.post('/student/profile', { full_name: 'Test Student Updated', phone: '17999999', programme: 'BSc Test 2' });
    assert.strictEqual((await db.query('SELECT full_name FROM users WHERE email=$1', [myEmail])).rows[0].full_name, 'Test Student Updated');
    await student.post('/student/profile/password', { current_password: 'Secret123', new_password: 'Changed456', confirm_password: 'Changed456' });
    const c = makeClient(base); await c.get('/login');
    assert.strictEqual((await c.post('/login', { email: myEmail, password: 'Changed456' })).status, 302);
  });
  await test('logout ends the session', async () => {
    await student.post('/logout', {});
    assert.strictEqual((await student.get('/student/dashboard')).status, 302);
  });

  server.close();
  await db.pool.end();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.log('Failed:\n - ' + failures.join('\n - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
