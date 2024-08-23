import { NextResponse } from 'next/server';
import schedule from 'node-schedule';
import pool from '/app/connection'; // Убедитесь, что путь к `pool` правильный

let isScheduled = false;
let previousStartTime = null;


export async function GET(req) {
  const client = await pool.connect();
  try {
    // Получаем startTime и scenarioId из базы данных
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

    // Сбрасываем isScheduled, если время начала изменилось
    if (previousStartTime !== startTime) {
      isScheduled = false;
      previousStartTime = startTime; // Обновляем предыдущее время начала
    }

    // Получаем сценарий комментариев по scenarioId
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

    // Проверяем, было ли уже запланировано выполнение комментариев
    if (!isScheduled) {
      isScheduled = true;

      // Планируем комментарии из базы данных
      commentsSchedule.forEach(({ showAt, text, sender, pinned }) => {
        const scheduleTime = new Date(startTime).getTime() + showAt * 1000;

        schedule.scheduleJob(new Date(scheduleTime), async () => {
          const message = {
            id: Date.now(), // Генерация уникального ID на основе времени
            sender,
            text,
            sendingTime: new Date().toLocaleTimeString(), // Генерация времени отправки
            pinned: pinned || false
          };

          // Сохраняем сообщение в базе данных
          await saveMessageToDb(message);
          broadcastMessages(); // Обновляем всех клиентов
        });
      });
    }

    // Генерация уникального ID для соединения
    const connectionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Добавление клиента в базу данных
    await client.query(`
      INSERT INTO clients_online (connection_id)
      VALUES ($1)`,
      [connectionId]
    );

    // Создание нового потока данных для отправки сообщений клиентам
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Логирование подключения клиента
    console.log('Клиент подключился');
    
    // Отправка текущих сообщений новому клиенту
    const currentMessages = await loadMessagesFromDb(); // Загрузка сообщений из базы данных
    const clientsCount = await getClientsCount();
    writer.write(`data: ${JSON.stringify({ messages: currentMessages, clientsCount })}\n\n`);

    // Очистка при закрытии соединения
    const onClose = async () => {
      console.log('Клиент отключился');

      await client.query(`
        DELETE FROM clients_online
        WHERE connection_id = $1`,
        [connectionId]
      );

      broadcastMessages(); // Уведомление остальных клиентов о новом количестве клиентов
    };
    writer.closed.then(onClose, onClose);

    // Создание ответа
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
    client.release(); // Освобождаем клиента
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

    // Обновление сообщений
    for (const message of newMessages) {
      // Добавляем сообщение в базу данных
      await saveMessageToDb(message);

      // Отправляем только отправителю
      if (sender) {
        const writer = clients.find(client => client.sender === sender);
        if (writer) {
          writer.write(`data: ${JSON.stringify({ messages: [message], clientsCount: clients.length })}\n\n`).catch(err => {
            console.error('Ошибка при отправке сообщения отправителю:', err);
          });
        }
      }
    }

    // Обновление закрепленных сообщений
    if (pinnedMessageId !== undefined) {
      await updatePinnedStatus(pinnedMessageId, !unpin);
    }

    // Обновляем всех клиентов, исключая только что отправленные сообщения
    broadcastMessages(sender);
    return NextResponse.json({ message: 'Сообщение обновлено' });
  } catch (error) {
    console.error('Ошибка при обновлении сообщения:', error);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}

// Функция для отправки сообщений всем клиентам, исключая отправленные сообщения
async function broadcastMessages(excludeSender) {
  const currentMessages = await loadMessagesFromDb();
  const clientsCount = await getClientsCount(); // Отдельный запрос для получения актуального количества клиентов
  const messagePayload = {
    messages: excludeSender
      ? currentMessages.filter(msg => msg.sender !== excludeSender)
      : currentMessages,
    clientsCount // Используем значение из базы данных
  };
  const messageData = `data: ${JSON.stringify(messagePayload)}\n\n`;

  clients.forEach(client => {
    client.write(messageData).catch(err => {
      console.error('Ошибка при отправке сообщения клиенту:', err);
      clients.splice(clients.indexOf(client), 1);
    });
  });
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
async function getClientsCount() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT COUNT(*) FROM clients_online');
    return parseInt(rows[0].count, 10);
  } finally {
    client.release();
  }
}