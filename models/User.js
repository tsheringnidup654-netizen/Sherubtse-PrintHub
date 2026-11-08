
const db = require('../config/db');

const PUBLIC_COLS = `
  id, student_id, full_name, email, role, phone,
  programme, avatar, is_active, created_at
`;

const findById = async (id) => {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLS} FROM users WHERE id = $1`,
    [id]
  );

  return rows[0];
};

// Case-insensitive email lookup
const findByEmail = async (email) => {
  const { rows } = await db.query(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );

  return rows[0];
};

const findByStudentId = async (sid) => {
  const { rows } = await db.query(
    'SELECT id FROM users WHERE student_id = $1',
    [sid]
  );

  return rows[0];
};

const getHash = async (id) => {
  const { rows } = await db.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [id]
  );

  return rows[0]?.password_hash;
};

async function create({
  student_id,
  full_name,
  email,
  password_hash,
  phone,
  programme
}) {
  const { rows } = await db.query(
    `INSERT INTO users
      (student_id, full_name, email, password_hash, phone, programme)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${PUBLIC_COLS}`,
    [
      student_id || null,
      full_name,
      email,
      password_hash,
      phone || null,
      programme || null
    ]
  );

  return rows[0];
}

const updateProfile = (id, {
  full_name,
  phone,
  programme
}) =>
  db.query(
    'UPDATE users SET full_name=$2, phone=$3, programme=$4 WHERE id=$1',
    [id, full_name, phone || null, programme || null]
  );

const updateAvatar = (id, file) =>
  db.query(
    'UPDATE users SET avatar=$2 WHERE id=$1',
    [id, file]
  );

const updatePassword = (id, hash) =>
  db.query(
    'UPDATE users SET password_hash=$2 WHERE id=$1',
    [id, hash]
  );

/** Students with their order stats (admin "Manage students"). */
async function listStudents(q) {
  const params = [];
  let where = "u.role = 'student'";

  if (q) {
    params.push(`%${q}%`);
    where += ` AND (
      u.full_name ILIKE $1
      OR u.email ILIKE $1
      OR u.student_id ILIKE $1
    )`;
  }

  const { rows } = await db.query(
    `SELECT
        u.id,
        u.student_id,
        u.full_name,
        u.email,
        u.phone,
        u.programme,
        u.is_active,
        u.created_at,
        COUNT(o.id)::int AS orders,
        COALESCE(
          SUM(o.total) FILTER (
            WHERE o.status NOT IN ('cancelled', 'rejected')
          ),
          0
        ) AS spent
     FROM users u
     LEFT JOIN orders o ON o.user_id = u.id
     WHERE ${where}
     GROUP BY u.id
     ORDER BY u.created_at DESC`,
    params
  );

  return rows;
}

const setActive = (id, active) =>
  db.query(
    "UPDATE users SET is_active=$2 WHERE id=$1 AND role='student'",
    [id, active]
  );

const adminIds = async () =>
  (
    await db.query(
      "SELECT id FROM users WHERE role='admin' AND is_active"
    )
  ).rows.map((r) => r.id);

const countStudents = async () =>
  (
    await db.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE role='student'"
    )
  ).rows[0].n;

module.exports = {
  findById,
  findByEmail,
  findByStudentId,
  getHash,
  create,
  updateProfile,
  updateAvatar,
  updatePassword,
  listStudents,
  setActive,
  adminIds,
  countStudents
};
