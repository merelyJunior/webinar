import { NextResponse } from 'next/server';
import schedule from 'node-schedule';
import pool from '/app/connection'; // Убедитесь, что путь к pool правильный

let isScheduled = false;
let previousStartTime = null;

export async function GET(req) {
  const client = await pool.connect();
  try {
    const connectionId = req.headers.get('Connection-Id');
    if (!connectionId) throw new Error('Отсутствует идентификатор соединения');

    await addClient(connectionId);

    const queryStream = `
      SELECT start_date, scenario_id
      FROM streams
      ORDER BY start_date DESC
      LIMIT 1
    `;
    const { rows: streamRows } = await client.query(queryStream);

    const startTime = streamRows[0]?.start_date;
    const scenarioId = streamRows[0]?.scenario_id;
    
    if (!startTime || !scenarioId) {
      throw new Error('Не удалось найти время начала или ID сценария');
    }

    if (previousStartTime !== startTime) {
      isScheduled = false;
      previousStartTime = startTime;
    }

    const queryScenario = `
      SELECT scenario_text
      FROM scenario
      WHERE id = $1
    `;
    const { rows: scenarioRows } = await client.query(queryScenario, [scenarioId]);
    const commentsSchedule = scenarioRows[0]?.scenario_text || '[]';

    if (!Array.isArray(commentsSchedule) || !commentsSchedule.length) {
      throw new Error('Сценарий пуст или отсутствует');
    }

    if (!isScheduled) {
      isScheduled = true;

      commentsSchedule.forEach(({ showAt, text, sender, pinned }) => {
        const scheduleTime = new Date(startTime).getTime() + showAt * 1000;

        schedule.scheduleJob(new Date(scheduleTime), async () => {
          const message = {
            id: Date.now(),
            sender,
            text,
            sendingTime: new Date().toLocaleTimeString(),
            pinned: pinned || false
          };

          await saveMessageToDb(message);
          await broadcastMessages(); // Обновляем всех клиентов
        });
      });
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    writer.closed.then(() => removeClient(connectionId));

    const currentMessages = await loadMessagesFromDb();
    writer.write(`data: ${JSON.stringify({ messages: currentMessages, clientsCount: 1 })}\n\n`);

    const response = new NextResponse(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

    return response;
  } catch (error) {
    console.error('Ошибка в API маршруте startStream:', error);
    return NextResponse.json({ error: 'Ошибка при запуске потока' }, { status: 500 });
  } finally {
    client.release();
    console.log('Соединение с базой данных закрыто');
  }
}

export async function POST(request) {
  try {
    const { newMessages = [], pinnedMessageId, unpin, sender } = await request.json();

    if (!Array.isArray(newMessages)) {
      console.error('newMessages должен быть массивом');
      return NextResponse.json({ message: 'Неверные данные' }, { status: 400 });
    }

    for (const message of newMessages) {
      message.sendingTime = new Date().toLocaleTimeString();

      await saveMessageToDb(message);
    }

    if (pinnedMessageId !== undefined) {
      await updatePinnedStatus(pinnedMessageId, !unpin);
    }

    const currentMessages = await loadMessagesFromDb();
    await broadcastMessages(currentMessages, sender);

    return NextResponse.json({ message: 'Сообщение обновлено' });
  } catch (error) {
    console.error('Ошибка при обновлении сообщения:', error);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}

async function broadcastMessages() {
  const client = await pool.connect();
  try {
    const query = 'SELECT connection_id FROM clients';
    const { rows } = await client.query(query);
    const clientIds = rows.map(row => row.connection_id);

    const messagePayload = {
      messages: await loadMessagesFromDb(),
      clientsCount: clientIds.length
    };
    const messageData = `data: ${JSON.stringify(messagePayload)}\n\n`;

    clientIds.forEach(clientId => {
      // Implement sending messages to the clients based on their connection_id
      // This needs SSE implementation based on connection_id
    });
  } catch (error) {
    console.error('Ошибка при отправке сообщений клиентам:', error);
  } finally {
    client.release();
  }
}

async function saveMessageToDb(message) {
  const client = await pool.connect();
  try {
    const insertQuery = `
      INSERT INTO messages (id, sender, text, sending_time, pinned)
      VALUES ($1, $2, $3, $4, $5)
    `;
    await client.query(insertQuery, [
      message.id,
      message.sender,
      message.text,
      message.sendingTime,
      message.pinned,
    ]);
  } catch (error) {
    console.error('Ошибка при сохранении сообщения в базе данных:', error);
  } finally {
    client.release();
  }
}

async function loadMessagesFromDb() {
  const client = await pool.connect();
  try {
    const query = 'SELECT * FROM messages ORDER BY sending_time DESC';
    const { rows } = await client.query(query);
    
    return rows;
  } catch (error) {
    console.error('Ошибка при загрузке сообщений из базы данных:', error);
    return [];
  } finally {
    client.release();
  }
}

async function updatePinnedStatus(messageId, pinned) {
  const client = await pool.connect();
  try {
    const updateQuery = 'UPDATE messages SET pinned = $1 WHERE id = $2';
    await client.query(updateQuery, [pinned, messageId]);
  } catch (error) {
    console.error('Ошибка при обновлении статуса закрепленного сообщения:', error);
  } finally {
    client.release();
  }
}

async function addClient(connectionId) {
  const client = await pool.connect();
  try {
    await client.query('INSERT INTO clients (connection_id) VALUES ($1)', [connectionId]);
  } catch (error) {
    console.error('Ошибка при добавлении клиента в базу данных:', error);
  } finally {
    client.release();
  }
}

async function removeClient(connectionId) {
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM clients WHERE connection_id = $1', [connectionId]);
  } catch (error) {
    console.error('Ошибка при удалении клиента из базы данных:', error);
  } finally {
    client.release();
  }
}
