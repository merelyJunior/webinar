import mysql from 'mysql2/promise';

// Настройте пул соединений
const pool = mysql.createPool({
  host: 'https://85.209.154.162',
  user: 'root',
  password: 'Haw4RYArvXY7bLnE3psK',
  database: 'webinar',
  timezone: 'local'
});

export default pool;
