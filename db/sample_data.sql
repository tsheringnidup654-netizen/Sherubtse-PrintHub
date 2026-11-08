-- =====================================================================
--  Sample data for local testing
--  Admin   : admin@sherubtse.edu.bt            / Admin@123
--  Students: 02230001.sherubtse@rub.edu.bt ... / Student@123
--  (the four student accounts 02230001 - 02230004 share the same password)
--  Deadlines are relative to NOW() so the live countdowns always look alive.
-- =====================================================================

INSERT INTO users (id, student_id, full_name, email, password_hash, role, phone, programme) VALUES
 (1, NULL,       'PrintHub Administrator', 'admin@sherubtse.edu.bt',
    '$2b$10$VSxnRlEbRMeL7CBi445lBO3be97lOkVJgmeF6fHKbcDSavSQsJ.du', 'admin',   '17000001', 'Print Shop Office'),
 (2, '02230001', 'Pema Wangchuk',  '02230001.sherubtse@rub.edu.bt',
    '$2b$10$mWWSjop9aM/NAQ3Ke7sBJeXmZVjsK4LN.sIBeO59clxUW69BFO18K', 'student', '17111111', 'BSc Computer Science'),
 (3, '02230002', 'Sonam Dema',     '02230002.sherubtse@rub.edu.bt',
    '$2b$10$mWWSjop9aM/NAQ3Ke7sBJeXmZVjsK4LN.sIBeO59clxUW69BFO18K', 'student', '17222222', 'BA English'),
 (4, '02230003', 'Karma Tenzin',   '02230003.sherubtse@rub.edu.bt',
    '$2b$10$mWWSjop9aM/NAQ3Ke7sBJeXmZVjsK4LN.sIBeO59clxUW69BFO18K', 'student', '17333333', 'BSc Environmental Science'),
 (5, '02230004', 'Dechen Choden',  '02230004.sherubtse@rub.edu.bt',
    '$2b$10$mWWSjop9aM/NAQ3Ke7sBJeXmZVjsK4LN.sIBeO59clxUW69BFO18K', 'student', '17444444', 'BSc Mathematics');
SELECT setval('users_id_seq', 5);

INSERT INTO categories (id, name, slug, description, sort_order) VALUES
 (1, 'Printing & Copying',    'printing',  'Black & white and colour printing and photocopying', 1),
 (2, 'Binding & Finishing',   'finishing', 'Spiral binding, project binding and lamination',     2),
 (3, 'Academic Documents',    'academic',  'Assignments, notes and study material',              3);
SELECT setval('categories_id_seq', 3);

INSERT INTO services (id, category_id, name, slug, description, icon, pricing_type, base_price, price, colour_price, unit_label, options_text, sort_order) VALUES
 (1, 1, 'Black and White Printing', 'bw-printing',
    'Crisp black and white laser printing for documents, reports and slides.',
    'bi-file-earmark-text', 'print', 2.00, 2.00, NULL, 'per A4 page', 'A4 / A3 - Single or double sided - Normal or high quality', 1),
 (2, 1, 'Colour Printing', 'colour-printing',
    'Vibrant full-colour printing for posters, presentations, charts and photos.',
    'bi-palette', 'print', 5.00, 5.00, 10.00, 'per A4 page', 'A4 / A3 - Colour or B/W - Normal or high quality', 2),
 (3, 1, 'Photocopying', 'photocopying',
    'Fast, clean photocopies of your originals - upload a scan or bring them in.',
    'bi-files', 'print', 1.00, 1.00, 5.00, 'per A4 page', 'A4 / A3 - B/W or colour - Single or double sided', 3),
 (4, 2, 'Spiral Binding', 'spiral-binding',
    'Durable plastic-coil binding that lets your document lie flat.',
    'bi-journal-bookmark', 'per_set', 40.00, 40.00, NULL, 'per document', 'Per bound set - choose when ordering any print job', 4),
 (5, 2, 'Project Binding', 'project-binding',
    'Hard-cover project and thesis binding with gold-foil title on request.',
    'bi-book', 'per_set', 150.00, 150.00, NULL, 'per document', 'Hard cover - Title on spine - Per bound set', 5),
 (6, 2, 'Document Lamination', 'document-lamination',
    'Protect certificates, ID cards and notices with glossy lamination.',
    'bi-layers', 'per_page_flat', 15.00, 15.00, NULL, 'per A4 page', 'A4 / A3 - Per sheet', 6),
 (7, 3, 'Assignment Printing', 'assignment-printing',
    'Print your assignments neatly and on time, ready for submission.',
    'bi-pencil-square', 'print', 2.00, 2.00, 8.00, 'per A4 page', 'A4 - B/W or colour - Single or double sided', 7),
 (8, 3, 'Notes and Study Material Printing', 'notes-printing',
    'Economical bulk printing of lecture notes, handouts and study packs.',
    'bi-mortarboard', 'print', 1.50, 1.50, 8.00, 'per A4 page', 'A4 / A3 - Double sided saves money - Bulk friendly', 8);
SELECT setval('services_id_seq', 8);

INSERT INTO settings (key, value) VALUES
 ('shop_name',          'Sherubtse PrintHub'),
 ('shop_location',      'Sherubtse College, Kanglung, Trashigang, Bhutan'),
 ('shop_phone',         '+975 17 000 001'),
 ('shop_email',         'printhub@sherubtse.edu.bt'),
 ('shop_hours',         'Mon - Sat, 9:00 AM - 5:00 PM'),
 ('a3_multiplier',      '2'),
 ('hq_multiplier',      '1.25'),
 ('duplex_discount',    '10'),
 ('urgent_surcharge_pct','25'),
 ('pages_per_hour',     '300'),
 ('min_lead_minutes',   '60'),
 ('payment_methods',    '[{"code":"cash","label":"Cash on collection","enabled":true,"needs_reference":false},{"code":"mbob","label":"mBoB / Bank transfer","enabled":true,"needs_reference":true},{"code":"mpay","label":"mPay / DK wallet","enabled":false,"needs_reference":true}]');

-- ------------------------------------------------------------- orders
INSERT INTO orders (id, order_no, user_id, status, is_urgent, urgent_status, subtotal, urgent_surcharge, total,
                    requested_deadline, estimated_completion, payment_method, notes, qr_token, created_at, updated_at) VALUES
 (1,'SH2026001', 2,'collected',FALSE,'none', 80.00, 0, 80.00,  NOW()-INTERVAL '5 days',  NULL, 'cash', 'Staple top-left please', md5(random()::text||'1'), NOW()-INTERVAL '7 days',  NOW()-INTERVAL '5 days'),
 (2,'SH2026002', 2,'printing', FALSE,'none',140.00, 0,140.00,  NOW()+INTERVAL '2 hours 30 minutes', NOW()+INTERVAL '1 hour', 'cash', NULL, md5(random()::text||'2'), NOW()-INTERVAL '1 day',   NOW()-INTERVAL '1 hour'),
 (3,'SH2026003', 3,'ready',    FALSE,'none',100.00, 0,100.00,  NOW()+INTERVAL '20 hours', NULL, 'mbob', NULL, md5(random()::text||'3'), NOW()-INTERVAL '1 day',   NOW()-INTERVAL '2 hours'),
 (4,'SH2026004', 3,'pending',  TRUE, 'requested', 27.00, 6.75, 33.75, NOW()+INTERVAL '2 days 14 hours', NULL, 'cash', 'Need before class', md5(random()::text||'4'), NOW()-INTERVAL '20 minutes', NOW()-INTERVAL '20 minutes'),
 (5,'SH2026005', 4,'accepted', FALSE,'none',486.00, 0,486.00,  NOW()+INTERVAL '5 hours', NOW()+INTERVAL '4 hours', 'cash', 'Chapters 1-4 of the module pack', md5(random()::text||'5'), NOW()-INTERVAL '3 hours',  NOW()-INTERVAL '2 hours'),
 (6,'SH2026006', 2,'cancelled',FALSE,'none', 10.00, 0, 10.00,  NOW()-INTERVAL '6 days',  NULL, 'cash', NULL, md5(random()::text||'6'), NOW()-INTERVAL '8 days',  NOW()-INTERVAL '8 days'),
 (7,'SH2026007', 4,'collected',FALSE,'none', 60.00, 0, 60.00,  NOW()-INTERVAL '10 days', NULL, 'cash', NULL, md5(random()::text||'7'), NOW()-INTERVAL '12 days', NOW()-INTERVAL '10 days'),
 (8,'SH2026008', 3,'collected',FALSE,'none',150.00, 0,150.00,  NOW()-INTERVAL '3 days',  NULL, 'mbob', 'Gold title: "Water Quality Study"', md5(random()::text||'8'), NOW()-INTERVAL '5 days',  NOW()-INTERVAL '3 days');
SELECT setval('orders_id_seq', 8);
SELECT setval('order_no_seq', 8);

INSERT INTO order_items (order_id, service_id, service_name, pages, copies, paper_size, colour_mode, sides, orientation, quality, binding_service_id, binding_name, instructions, unit_price, binding_cost, line_total) VALUES
 (1, 1,'Black and White Printing', 20, 2,'A4','bw',    'single','portrait', 'normal',NULL,NULL,             'Staple top-left', 2.00, 0, 80.00),
 (2, 2,'Colour Printing',          10, 1,'A4','colour','single','portrait', 'normal',4,'Spiral Binding',    NULL,            10.00,40,140.00),
 (3, 3,'Photocopying',            100, 1,'A4','bw',    'single','portrait', 'normal',NULL,NULL,             NULL,             1.00, 0,100.00),
 (4, 7,'Assignment Printing',      15, 1,'A4','bw',    'double','portrait', 'normal',NULL,NULL,             NULL,             1.80, 0, 27.00),
 (5, 8,'Notes and Study Material Printing',120,3,'A4','bw','double','portrait','normal',NULL,NULL,           NULL,             1.35, 0,486.00),
 (6, 1,'Black and White Printing',  5, 1,'A4','bw',    'single','portrait', 'normal',NULL,NULL,             NULL,             2.00, 0, 10.00),
 (7, 6,'Document Lamination',       4, 1,'A4','bw',    'single','portrait', 'normal',NULL,NULL,             NULL,            15.00, 0, 60.00),
 (8, 5,'Project Binding',           1, 1,'A4','bw',    'single','portrait', 'normal',NULL,NULL,             'Gold title',   150.00, 0,150.00);

INSERT INTO payments (order_id, method, amount, status, reference, paid_at, created_at) VALUES
 (1,'cash',   80.00,'paid',   NULL,          NOW()-INTERVAL '5 days',  NOW()-INTERVAL '7 days'),
 (2,'cash',  140.00,'pending',NULL,          NULL,                     NOW()-INTERVAL '1 day'),
 (3,'mbob',  100.00,'paid',   'MB88213344',  NOW()-INTERVAL '1 day',   NOW()-INTERVAL '1 day'),
 (4,'cash',   33.75,'pending',NULL,          NULL,                     NOW()-INTERVAL '20 minutes'),
 (5,'cash',  486.00,'pending',NULL,          NULL,                     NOW()-INTERVAL '3 hours'),
 (6,'cash',   10.00,'failed', NULL,          NULL,                     NOW()-INTERVAL '8 days'),
 (7,'cash',   60.00,'paid',   NULL,          NOW()-INTERVAL '10 days', NOW()-INTERVAL '12 days'),
 (8,'mbob',  150.00,'paid',   'MB77120988',  NOW()-INTERVAL '3 days',  NOW()-INTERVAL '5 days');

INSERT INTO order_status_history (order_id, status, note, changed_by, changed_at) VALUES
 (1,'pending',  'Order placed', 2, NOW()-INTERVAL '7 days'),
 (1,'accepted', 'Order accepted', 1, NOW()-INTERVAL '6 days 20 hours'),
 (1,'printing', 'Printing started', 1, NOW()-INTERVAL '6 days'),
 (1,'ready',    'Ready at the print shop counter', 1, NOW()-INTERVAL '5 days 4 hours'),
 (1,'collected','Collected by student', 1, NOW()-INTERVAL '5 days'),
 (2,'pending',  'Order placed', 2, NOW()-INTERVAL '1 day'),
 (2,'accepted', 'Order accepted', 1, NOW()-INTERVAL '23 hours'),
 (2,'printing', 'Printing started', 1, NOW()-INTERVAL '1 hour'),
 (3,'pending',  'Order placed', 3, NOW()-INTERVAL '1 day'),
 (3,'accepted', 'Order accepted', 1, NOW()-INTERVAL '22 hours'),
 (3,'printing', 'Printing started', 1, NOW()-INTERVAL '5 hours'),
 (3,'ready',    'Ready for collection', 1, NOW()-INTERVAL '2 hours'),
 (4,'pending',  'Order placed (urgent requested)', 3, NOW()-INTERVAL '20 minutes'),
 (5,'pending',  'Order placed', 4, NOW()-INTERVAL '3 hours'),
 (5,'accepted', 'Order accepted', 1, NOW()-INTERVAL '2 hours'),
 (6,'pending',  'Order placed', 2, NOW()-INTERVAL '8 days'),
 (6,'cancelled','Cancelled by student', 2, NOW()-INTERVAL '8 days'),
 (7,'pending',  'Order placed', 4, NOW()-INTERVAL '12 days'),
 (7,'accepted', 'Order accepted', 1, NOW()-INTERVAL '12 days'),
 (7,'printing', 'Printing started', 1, NOW()-INTERVAL '11 days'),
 (7,'ready',    'Ready for collection', 1, NOW()-INTERVAL '10 days 3 hours'),
 (7,'collected','Collected by student', 1, NOW()-INTERVAL '10 days'),
 (8,'pending',  'Order placed', 3, NOW()-INTERVAL '5 days'),
 (8,'accepted', 'Order accepted', 1, NOW()-INTERVAL '5 days'),
 (8,'printing', 'Printing started', 1, NOW()-INTERVAL '4 days'),
 (8,'ready',    'Ready for collection', 1, NOW()-INTERVAL '3 days 2 hours'),
 (8,'collected','Collected by student', 1, NOW()-INTERVAL '3 days');

INSERT INTO collection_records (order_id, collected_by, method, collected_at) VALUES
 (1, 1, 'qr',     NOW()-INTERVAL '5 days'),
 (7, 1, 'manual', NOW()-INTERVAL '10 days'),
 (8, 1, 'qr',     NOW()-INTERVAL '3 days');

INSERT INTO feedback (user_id, order_id, rating, comment, created_at) VALUES
 (2, 1, 5, 'Fast service and very clean prints. The countdown helped me plan my day!', NOW()-INTERVAL '4 days'),
 (4, 7, 4, 'Lamination was good, only wish it was ready a bit earlier.',                NOW()-INTERVAL '9 days'),
 (3, 8, 5, 'Beautiful binding for my project. Highly recommended.',                     NOW()-INTERVAL '2 days');

INSERT INTO notifications (user_id, order_id, type, title, message, is_read, created_at) VALUES
 (2, 2, 'printing', 'Printing has begun',      'Order SH2026002 is now being printed.',                         FALSE, NOW()-INTERVAL '1 hour'),
 (2, 2, 'deadline_approaching', 'Deadline approaching', 'Order SH2026002 is due in under 3 hours.',           FALSE, NOW()-INTERVAL '10 minutes'),
 (3, 3, 'ready',    'Order ready for collection','Order SH2026003 is ready. Please collect it before your deadline.', FALSE, NOW()-INTERVAL '2 hours'),
 (3, 4, 'order_placed','Order received',        'Order SH2026004 was placed. Your urgent request is awaiting admin review.', FALSE, NOW()-INTERVAL '20 minutes'),
 (4, 5, 'accepted', 'Order accepted',          'Order SH2026005 has been accepted.',                            FALSE, NOW()-INTERVAL '2 hours'),
 (1, 4, 'new_order','New urgent order',        'Order SH2026004 (Sonam Dema) requested urgent printing.',        FALSE, NOW()-INTERVAL '20 minutes');
