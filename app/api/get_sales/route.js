// app/api/scenario/route.js
import pool from '/app/connection'; // Убедитесь, что путь к `pool` правильный

export async function POST(request) {
  const client = await pool.connect(); // Получаем клиента из пула
  try {
    const { scenarioId } = await request.json();

    try {
      const query = `
        SELECT scenario_sales
        FROM scenario
        WHERE id = $1
      `;
      const { rows } = await client.query(query, [scenarioId]);

      if (rows.length === 0) {
        return new Response(JSON.stringify({ error: 'Сценарий не найден' }), { status: 404 });
      }

      return new Response(JSON.stringify(rows[0]), { status: 200 });
    } finally {
      client.release(); // Освобождаем клиента
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
