const pool = require('./config/database-sqlite');

async function checkDatabase() {
  try {
    const result = await pool.query("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('Tables in database:', result.rows);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDatabase();
