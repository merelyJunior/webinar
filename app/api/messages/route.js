import { NextResponse } from 'next/server';
import schedule from 'node-schedule';
import pool from '/app/connection'; 
import moment from 'moment-timezone'; // Добавьте библиотеку для работы с временными зонами

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

    // Преобразуем startTime в UTC
    const startTimeUTC = moment(startTime).utc().toDate();

    // Сбрасываем isScheduled, если время начала изменилось
    if (previousStartTime !== startTimeUTC) {
      isScheduled = false;
      previousStartTime = startTimeUTC; // Обновляем предыдущее время начала
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
        const scheduleTime = startTimeUTC.getTime() + showAt * 1000;
        console.log(`Запланированное время: ${new Date(scheduleTime).toISOString()}`);
        
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
