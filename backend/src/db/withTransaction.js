// Runs a group of database steps as ONE all-or-nothing unit.
// If anything inside throws an error, every change is undone (rolled back).
//
// Usage:
//   const result = await withTransaction(async (client) => {
//     await client.query('INSERT ...');
//     await client.query('UPDATE ...');
//     return 'done';
//   });

const pool = require('./pool');

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // the connection may already be broken; nothing more we can do
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = withTransaction;