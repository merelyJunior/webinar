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

    const startTime = streamRows[0]?.start_date; // Время из базы данных
    const scenarioId = streamRows[0]?.scenario_id;
    console.log(startTime);
    
    if (!startTime || !scenarioId) {
      throw new Error('Не удалось найти время начала или ID сценария');
    }

    // Проверяем, нужно ли планировать задачи
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

    // if (!Array.isArray(commentsSchedule) || !commentsSchedule.length) {
    //   throw new Error('Сценарий пуст или отсутствует');
    // }

    // Проверяем, было ли уже запланировано выполнение комментариев
    if (!isScheduled) {
      isScheduled = true;
      commentsSchedule.forEach(({ showAt, text, sender, pinned }) => {
        const scheduleTime = new Date(startTime).getTime() + showAt * 1000;
    
        console.log(`Запланированная отправка сообщения "${text}" начнется в ${new Date(scheduleTime).toLocaleString()}`);
        
        if (!schedule.scheduledJobs[`${text}-${scheduleTime}`]) { // Unique identifier for each job
          schedule.scheduleJob(`${text}-${scheduleTime}`, new Date(scheduleTime), async () => {
            try {
              console.log(`Отправка сообщения: "${text}" началась в ${new Date().toLocaleString()}`);
              
              const message = {
                id: Date.now(),
                sender,
                text,
                sendingTime: new Date().toLocaleTimeString(),
                pinned: pinned || false
              };
              
              await saveMessageToDb(message);
              broadcastMessages([message]);
            } catch (error) {
              console.error('Ошибка во время выполнения запланированного задания:', error);
            }
          });
        } else {
          console.log(`Задание для сообщения "${text}" уже существует, пропуск...`);
        }
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
    const { newMessages = [], pinnedMessageId, pinned, sender } = body;
    if (pinnedMessageId !== undefined) {
      await updatePinnedStatus(pinnedMessageId, pinned);
    }else{
      let message = newMessages[0];
      message.sendingTime = new Date().toLocaleTimeString();

      await saveMessageToDb(message);

      broadcastMessages([message], sender);

      console.log('Сообщение отправлено клиентам');
    }
    

    return NextResponse.json({ message: 'Сообщение обновлено' });
  } catch (error) {
    console.error('Ошибка при обработке POST-запроса:', error);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}
async function updatePinnedStatus(messageId, pinned) {
  const client = await pool.connect();
  try {
    const updateQuery = 'UPDATE messages SET pinned = $1 WHERE id = $2';
    await client.query(updateQuery, [pinned, messageId]);
    await updateAndBroadcastPinnedStatus(messageId, pinned);
  } catch (error) {
    console.error('Ошибка при обновлении статуса закрепленного сообщения:', error);
  } finally {
    client.release();
  }
}
async function updateAndBroadcastPinnedStatus(messageId, pinned) {
  try {
    // Формируем данные для отправки клиентам
    const messagePayload = {
      messageId,
      pinned
    };

    const messageData = `data: ${JSON.stringify(messagePayload)}\n\n`;

    // Передаем данные всем подключенным клиентам
    clients.forEach((client) => {
      client.write(messageData).catch(err => {
        const clientIndex = clients.indexOf(client);
        if (clientIndex !== -1) {
          clients.splice(clientIndex, 1);
          console.log('Клиент удален из списка из-за ошибки отправки');
        }
      });
    });

    console.log('Сообщение успешно отправлено всем клиентам');
  } catch (error) {
    console.error('Ошибка при обновлении и трансляции статуса закрепленного сообщения:', error);
  }
}
async function broadcastMessages(newMessages = [], excludeSender) {
  try {
    const messagePayload = {
      messages: excludeSender
        ? newMessages.filter(msg => msg.sender !== excludeSender)
        : newMessages.map(msg => ({
            ...msg,
            id: msg.id.toString() // Преобразуем BigInt в строку
          })),
      clientsCount: clients.length
    };
    const messageData = `data: ${JSON.stringify(messagePayload)}\n\n`;

    clients.forEach((client) => {
      client.write(messageData).catch(err => {
        const clientIndex = clients.indexOf(client);
        if (clientIndex !== -1) {
          clients.splice(clientIndex, 1);
          console.log('Клиент удален из списка из-за ошибки отправки');
        }
      });
    });

    console.log('Сообщения успешно отправлены всем клиентам');
  } catch (error) {
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

