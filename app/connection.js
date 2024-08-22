import mysql from 'mysql2/promise';

// Настройте пул соединений
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'webinar',
  timezone: 'local'
});

export default pool;
