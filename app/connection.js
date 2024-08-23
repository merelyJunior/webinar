import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM your_table');
    res.json(result.rows);
  } finally {
    client.release();
  }
}