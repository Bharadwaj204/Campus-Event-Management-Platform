const fs = require('fs');
const path = require('path');
const pool = require('../config/database-sqlite');

async function runMigrations() {
  try {
    console.log('🔄 Starting SQLite database migration...');

    // Read schema file
    const schemaPath = path.join(__dirname, 'schema-sqlite.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split schema into individual statements
    const statements = schema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    // Execute each statement
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await pool.query(statement);
          console.log('✅ Executed:', statement.substring(0, 50) + '...');
        } catch (error) {
          console.log('⚠️  Skipped (already exists):', statement.substring(0, 50) + '...');
        }
      }
    }

    console.log('✅ SQLite database migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
