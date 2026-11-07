const bcrypt = require('bcryptjs');
const pool = require('./db');

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.log('Pemakaian: node src/seed-admin.js <username> <password>');
  process.exit(1);
}

(async () => {
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [username, hash]
  );
  console.log('Admin siap:', username);
  await pool.end();
})();