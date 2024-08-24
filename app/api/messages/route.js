import { NextResponse } from 'next/server';
import schedule from 'node-schedule';
import pool from '/app/connection'; 

let isScheduled = false;
let previousStartTime = null;

const clients = []; 

export async function GET(req) {
  const client = await pool.connect(); // Получаем клиента из пула
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

    const body = await request.json();

    const { newMessages = [], pinnedMessageId, unpin, sender } = body;

    // Проверка корректности данных
    if (!Array.isArray(newMessages) || newMessages.length !== 1) {
      console.error('newMessages должен быть массивом с одним элементом');
      return NextResponse.json({ message: 'Неверные данные' }, { status: 400 });
    }

    let message = newMessages[0];
    message.sendingTime = new Date().toLocaleTimeString();
    await saveMessageToDb(message);

    broadcastMessages([message], sender);
    console.log('Сообщение отправлено клиентам');

    // Обновление закрепленных сообщений
    if (pinnedMessageId !== undefined) {
      console.log(`Обновление статуса закрепленного сообщения: ${pinnedMessageId}, unpin: ${unpin}`);
      await updatePinnedStatus(pinnedMessageId, !unpin);
      console.log('Статус закрепленного сообщения обновлен');
    }

    return NextResponse.json({ message: 'Сообщение обновлено' });
  } catch (error) {
    console.error('Ошибка при обработке POST-запроса:', error);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}

async function broadcastMessages(newMessages = [], excludeSender) {
  try {
    // Логируем получение новых сообщений
    console.log('Получены новые сообщения для трансляции:', newMessages);

    // Формируем payload для отправки клиентам
    const messagePayload = {
      messages: excludeSender
        ? newMessages.filter(msg => msg.sender !== excludeSender)
        : newMessages,
      clientsCount: clients.length
    };
    const messageData = `data: ${JSON.stringify(messagePayload)}\n\n`;

    // Логируем сформированные данные для отправки клиентам
    console.log('Отправляем сообщение следующим клиентам:');
    clients.forEach((client, index) => {
      console.log(`Клиент ${index + 1}:`);
      console.log('Сообщение:', messageData);
      client.write(messageData).catch(err => {
        console.error('Ошибка при отправке сообщения клиенту:', err);
        // Удаляем клиента из списка, если произошла ошибка при отправке
        const clientIndex = clients.indexOf(client);
        if (clientIndex !== -1) {
          clients.splice(clientIndex, 1);
          console.log('Клиент удален из списка из-за ошибки отправки');
        }
      });
    });

    // Логируем успешную отправку
    console.log('Сообщения успешно отправлены всем клиентам');
  } catch (error) {
    // Логируем любую ошибку, которая могла возникнуть в процессе
    console.error('Ошибка в процессе трансляции сообщений:', error);
  }
}

async function saveMessageToDb(message) {
  const client = await pool.connect();
  try {
    console.log('Сохраняем сообщение в базу данных:', message);

    const insertQuery = `
      INSERT INTO messages (id, sender, text, sending_time, pinned)
      VALUES ($1, $2, $3, $4, $5)
    `;
    await client.query(insertQuery, [
      message.id,
      message.sender,
      message.text,
      new Date().toISOString(), // Используем текущую дату и время
      message.pinned,
    ]);

    console.log('Сообщение успешно сохранено в базу данных');
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