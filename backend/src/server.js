// Switches the server on.

const app = require('./app');
const env = require('./config/env');
const pool = require('./db/pool');

async function start() {
  // Check the database connection before accepting any requests.
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    console.error('Cannot connect to the database as app_user:', error.message);
    console.error('Did you run "npm run db:migrate" in the project root? Check APP_DATABASE_URL in .env.');
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`MatchEngine backend is running at http://localhost:${env.port}`);
  });

  // Shut down politely when you press Ctrl+C.
  const shutdown = () => {
    console.log('\nShutting down...');
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();