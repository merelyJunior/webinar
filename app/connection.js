// import mysql from 'mysql2/promise';

// const pool = mysql.createPool({
//   host: '85.209.154.162',
//   user: 'root',
//   password: 'Haw4RYArvXY7bLnE3psK',
//   database: 'webinar',
// });

// export default pool;
import { Pool } from 'pg';

// Строка подключения
const connectionString = "postgres://default:6MtWFzg3OGEr@ep-floral-cloud-a46xmgzv.us-east-1.aws.neon.tech:5432/verceldb?sslmode=require";

// Создание пула подключений
const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false, 
  },
});

export default pool;