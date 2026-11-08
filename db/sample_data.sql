-- ============================================================================
--  Sherubtse PrintHub - reference / sample data (categories, services, settings)
--  User accounts and sample orders are created by scripts/setup-db.js because
--  passwords must be hashed with bcrypt.
-- ============================================================================

INSERT INTO categories (name, description) VALUES
 ('Printing',              'Black and white and colour printing from your digital files'),
 ('Photocopying',          'Quick photocopies of your original documents'),
 ('Binding & Finishing',   'Spiral binding, project binding and lamination'),
 ('Study Material',        'Assignments, notes and course packs');

-- price = rate for the service's base mode. See utils/pricing.js for how the options modify it.
INSERT INTO services
 (category_id, name, slug, description, options_text, icon, price, pricing_type, unit_label, colour_mode, uses_print_options, requires_document, sort_order)
VALUES
 (1, 'Black and White Printing', 'black-and-white-printing',
  'Crisp black and white laser printing for reports, handouts and articles. Upload your file and choose paper size, sides and quality.',
  'A4 / A3 - Single or double sided - Normal or high quality', 'bi-file-earmark-text', 1.50, 'per_page', 'page', 'bw', TRUE, TRUE, 1),

 (1, 'Colour Printing', 'colour-printing',
  'Vibrant full-colour printing for presentations, posters, diagrams and photos.',
  'A4 / A3 - Single or double sided - Normal or high quality', 'bi-palette', 8.00, 'per_page', 'page', 'colour', TRUE, TRUE, 2),

 (2, 'Photocopying', 'photocopying',
  'Fast photocopies of your documents. Choose black and white or colour copies.',
  'A4 / A3 - B&W or colour - Single or double sided', 'bi-files', 1.00, 'per_page', 'page', 'choice', TRUE, TRUE, 3),

 (3, 'Spiral Binding', 'spiral-binding',
  'Durable plastic-coil spiral binding with a clear cover sheet - ideal for assignments and reports.',
  'Per bound copy', 'bi-journal-bookmark', 40.00, 'per_copy', 'copy', 'bw', FALSE, FALSE, 4),

 (3, 'Project Binding', 'project-binding',
  'Hard-cover project and thesis binding with gold-embossed title. Best for final-year projects.',
  'Hard cover - Gold embossing - Per bound copy', 'bi-book', 150.00, 'per_copy', 'copy', 'bw', FALSE, FALSE, 5),

 (3, 'Document Lamination', 'document-lamination',
  'Protect certificates, ID cards and important papers with glossy lamination.',
  'A4 / A3 - Price per laminated sheet', 'bi-shield-check', 15.00, 'per_page', 'sheet', 'bw', FALSE, FALSE, 6),

 (4, 'Assignment Printing', 'assignment-printing',
  'Student-friendly assignment printing at a special rate. Black and white or colour.',
  'A4 - B&W or colour - Single or double sided', 'bi-pencil-square', 1.25, 'per_page', 'page', 'choice', TRUE, TRUE, 7),

 (4, 'Notes and Study Material Printing', 'study-material-printing',
  'Bulk printing of lecture notes, slides and course packs at the lowest per-page rate.',
  'A4 - Handout layouts - Double sided recommended', 'bi-collection', 1.00, 'per_page', 'page', 'choice', TRUE, TRUE, 8);

INSERT INTO settings (key, value) VALUES
 ('pricing', '{
    "colour_multiplier": 5,
    "a3_multiplier": 2,
    "double_sided_factor": 0.85,
    "high_quality_multiplier": 1.5,
    "urgent_surcharge_percent": 25
  }'),
 ('queue', '{
    "pages_per_minute": 25,
    "base_minutes": 15,
    "min_lead_minutes": 60,
    "urgent_min_lead_minutes": 30
  }'),
 ('payment_methods', '[
    {"code":"cash", "label":"Cash on Collection", "enabled":true,  "needs_reference":false, "instructions":"Pay at the PrintHub counter when you collect your documents."},
    {"code":"mbob", "label":"mBoB Transfer",      "enabled":false, "needs_reference":true,  "instructions":"Transfer to the PrintHub mBoB account and enter the journal number."},
    {"code":"mpay", "label":"mPay Transfer",      "enabled":false, "needs_reference":true,  "instructions":"Transfer to the PrintHub mPay account and enter the reference number."},
    {"code":"dk",   "label":"DK Bank Transfer",   "enabled":false, "needs_reference":true,  "instructions":"Transfer to the PrintHub account and enter the transaction ID."}
  ]'),
 ('shop', '{
    "name": "Sherubtse PrintHub",
    "address": "Sherubtse College, Kanglung, Trashigang, Bhutan",
    "phone": "+975 17 00 00 00",
    "email": "printhub@sherubtse.edu.bt",
    "hours": "Mon - Fri: 8:30 AM - 5:00 PM - Sat: 9:00 AM - 1:00 PM"
  }');
