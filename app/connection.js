import mysql from 'mysql2/promise';

// Настройте пул соединений
const pool = mysql.createPool({
  host: 'localhost',
  user: 'ch87e37f20_test',
  password: '1q2w3e4r',
  database: 'ch87e37f20_webinar',
  timezone: 'local'
});

export default pool;
