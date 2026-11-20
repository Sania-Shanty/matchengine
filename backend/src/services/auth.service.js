// Business logic for registration and login.

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const pool = require('../db/pool');
const withTransaction = require('../db/withTransaction');
const { conflict, unauthorized } = require('../utils/errors');

const STARTING_CASH = '100000.00'; // Rs. 100,000.00 of virtual money
const STARTING_SHARES = 100; // shares of every security

function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '12h' });
}

async function register({ email, fullName, password }) {
  const passwordHash = await bcrypt.hash(password, 10);

  // One transaction: the user, the account and the starting shares
  // are all created together, or none of them are.
  const user = await withTransaction(async (client) => {
    let userRow;
    try {
      const result = await client.query(
        `INSERT INTO users (email, full_name, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, email, full_name AS "fullName"`,
        [email, fullName, passwordHash]
      );
      userRow = result.rows[0];
    } catch (error) {
      if (error.code === '23505') {
        throw conflict('An account with this email already exists.', 'EMAIL_TAKEN');
      }
      throw error;
    }

    const account = await client.query(
      `INSERT INTO accounts (user_id, cash_balance, reserved_balance)
       VALUES ($1, $2, 0)
       RETURNING id`,
      [userRow.id, STARTING_CASH]
    );

    await client.query(
      `INSERT INTO holdings (account_id, security_id, quantity, reserved_quantity)
       SELECT $1, id, $2, 0 FROM securities`,
      [account.rows[0].id, STARTING_SHARES]
    );

    return userRow;
  });

  return { token: signToken(user.id), user };
}

async function login({ email, password }) {
  const result = await pool.query(
    `SELECT id, email, full_name AS "fullName", password_hash AS "passwordHash"
     FROM users WHERE email = $1`,
    [email]
  );

  // Same message for "no such user" and "wrong password",
  // so attackers cannot discover which emails are registered.
  const badLogin = unauthorized('Incorrect email or password.');

  if (result.rowCount === 0) {
    throw badLogin;
  }

  const row = result.rows[0];
  const passwordOk = await bcrypt.compare(password, row.passwordHash);
  if (!passwordOk) {
    throw badLogin;
  }

  return {
    token: signToken(row.id),
    user: { id: row.id, email: row.email, fullName: row.fullName },
  };
}

async function getUserById(userId) {
  const result = await pool.query(
    `SELECT id, email, full_name AS "fullName", created_at AS "createdAt"
     FROM users WHERE id = $1`,
    [userId]
  );

  if (result.rowCount === 0) {
    throw unauthorized('This user no longer exists.');
  }

  return result.rows[0];
}

module.exports = { register, login, getUserById };