import { NextResponse } from 'next/server';
import schedule from 'node-schedule';
import pool from '/app/connection'; // Убедитесь, что путь к pool правильный

const clients = []; // Массив для хранения подключенных клиентов
async function getStreamStatus(streamId) {
  const client = await pool.connect();
  try {
    const query = `
      SELECT is_scheduled, previous_start_time
      FROM streams
      WHERE id = $1
      ORDER BY id DESC
      LIMIT 1
    `;
    const { rows } = await client.query(query, [streamId]);
    return rows[0] || { is_scheduled: false, previous_start_time: null };
  } finally {
    client.release();
  }
}

// Функция для обновления состояния потока в базе данных
async function updateStreamStatus(streamId, isScheduled, previousStartTime) {
  const client = await pool.connect();
  try {
    const query = `
      INSERT INTO streams (id, is_scheduled, previous_start_time)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) 
      DO UPDATE SET is_scheduled = $2, previous_start_time = $3
    `;
    await client.query(query, [streamId, isScheduled, previousStartTime]);
  } finally {
    client.release();
  }
}

// Функция для вставки записи в таблицу execution_logs
async function logExecution(streamId) {
  const client = await pool.connect();
  try {
    const query = `
      INSERT INTO execution_logs (stream_id)
      VALUES ($1)
    `;
    await client.query(query, [streamId]);
    console.log('Запись успешно добавлена в execution_logs для потока:', streamId);
  } catch (error) {
    console.error('Ошибка при добавлении записи в execution_logs:', error);
  } finally {
    client.release();
  }
}

export async function GET(req) {
  const client = await pool.connect(); // Получаем клиента из пула
  try {
    // Получаем startTime и scenarioId из базы данных
    const queryStream = `
      SELECT id, start_date, scenario_id
      FROM streams
      ORDER BY start_date DESC
      LIMIT 1
    `;
    const { rows: streamRows } = await client.query(queryStream);
    
    if (streamRows.length === 0) {
      throw new Error('Не удалось найти время начала или ID сценария');
    }

    const { id: streamId, start_date: startTime, scenario_id: scenarioId } = streamRows[0];
    
    // Получаем состояние потока
    let { is_scheduled: isScheduled, previous_start_time: previousStartTime } = await getStreamStatus(streamId);

    console.log('Текущее состояние isScheduled:', isScheduled);

    // Сбрасываем isScheduled, если время начала изменилось
    if (previousStartTime !== startTime) {
      console.log('Время начала изменилось, сбрасываем isScheduled в false');
      isScheduled = false;
      await updateStreamStatus(streamId, isScheduled, startTime); // Обновляем состояние
    }

    // Получаем сценарий комментариев по scenarioId
    const queryScenario = `
      SELECT scenario_text
      FROM scenario
      WHERE id = $1
    `;
    const { rows: scenarioRows } = await client.query(queryScenario, [scenarioId]);
    const commentsSchedule = JSON.parse(scenarioRows[0]?.scenario_text || '[]'); // Парсинг текста сценария в массив

    if (!Array.isArray(commentsSchedule) || !commentsSchedule.length) {
      throw new Error('Сценарий пуст или отсутствует');
    }

    // Проверяем, было ли уже запланировано выполнение комментариев
    if (!isScheduled) {
      console.log('Планирование комментариев');
      isScheduled = true;

      // Логируем выполнение
      await logExecution(streamId);

      // Обновляем состояние
      await updateStreamStatus(streamId, isScheduled, startTime);
    } else {
      console.log('Комментарии уже запланированы, пропускаем');
    }

    // Создание нового потока данных для отправки сообщений клиентам
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Логирование подключения клиента
    console.log('Клиент подключился');
    
    // Добавление нового клиента в список
    clients.push(writer);

    // Отправка текущих сообщений новому клиенту
    const currentMessages = await loadMessagesFromDb(); // Загрузка сообщений из базы данных
    writer.write(`data: ${JSON.stringify({ messages: currentMessages, clientsCount: clients.length })}\n\n`);

    // Очистка при закрытии соединения
    const onClose = () => {
      console.log('Клиент отключился');
      clients.splice(clients.indexOf(writer), 1);
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

    // Обработка новых сообщений
    for (const message of newMessages) {
      // Добавляем время создания на сервере
      message.sendingTime = new Date().toLocaleTimeString();
      await saveMessageToDb(message);
    }

    // Обновление закрепленных сообщений
    if (pinnedMessageId !== undefined) {
      await updatePinnedStatus(pinnedMessageId, !unpin);
    }

    // Обновляем всех клиентов
    const currentMessages = await loadMessagesFromDb();
    broadcastMessages(currentMessages, sender);

    return NextResponse.json({ message: 'Сообщение обновлено' });
  } catch (error) {
    console.error('Ошибка при обновлении сообщения:', error);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}

async function broadcastMessages(messages, excludeSender) {
  const messagePayload = {
    messages: excludeSender
      ? messages.filter(msg => msg.sender !== excludeSender)
      : messages,
    clientsCount: clients.length
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
