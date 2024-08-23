// app/api/scenario/route.js
import pool from '/app/connection'; // Убедитесь, что путь к `pool` правильный

export async function POST(request) {
  try {
    const { scenarioId } = await request.json();

    const connection = await pool.getConnection();
    
    try {
      const query = `
        SELECT scenario_sales
        FROM scenario
        WHERE id = ?
      `;
      const [rows] = await connection.query(query, [scenarioId]);

      return new Response(JSON.stringify(rows[0]), { status: 200 });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Ошибка при получении сценария:', error);
    return new Response(JSON.stringify({ error: 'Не удалось получить сценарий' }), { status: 500 });
  }
}

export async function GET() {
  // Обработка других методов, если необходимо
  return new Response('Метод GET не разрешен', { status: 405 });
}
