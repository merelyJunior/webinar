import pool from '/app/connection'; // Проверьте правильность пути к pool
import { NextResponse } from 'next/server';

export async function GET() {

  let connection;
  try {
    connection = await pool.getConnection();

    const query = `
      SELECT id, name, start_date, scenario_id, video_id, video_duration, users_count
      FROM Streams
      ORDER BY start_date DESC
      LIMIT 1
    `;
    const [rows] = await connection.query(query);


    return NextResponse.json(rows[0] || {});
  } catch (error) {
    console.error('Error fetching data:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  } finally {
    if (connection) {
      connection.release();
      console.log('Connection released');
    }
  }
}

export async function POST() {
  // Вы можете добавить обработку POST запроса, если необходимо
  return NextResponse.json({ error: 'Method POST Not Allowed' }, { status: 405 });
}
