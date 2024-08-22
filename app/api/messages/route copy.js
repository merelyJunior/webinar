import { NextResponse } from 'next/server';
import schedule from 'node-schedule';
import pool from '/app/connection';

let messages = [];
let clients = [];
let isScheduled = false;
let previousStartTime = null;

export async function GET() {
  try {
    // Получаем startTime и scenarioId из базы данных
    const connection = await pool.getConnection();
    const queryStream = `
      SELECT start_date, scenario_id
      FROM Streams
      ORDER BY start_date DESC
      LIMIT 1
    `;
    const [streamRows] = await connection.query(queryStream);

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
      WHERE id = ?
    `;
    const [scenarioRows] = await connection.query(queryScenario, [scenarioId]);
    connection.release();
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

        schedule.scheduleJob(new Date(scheduleTime), () => {
          const message = {
            id: Date.now(), // Генерация уникального ID на основе времени
            sender,
            text,
            sendingTime: new Date().toLocaleTimeString(), // Генерация времени отправки
            pinned: pinned || false
          };

          messages.push(message);
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
    console.log('Отправка текущих сообщений клиенту:', messages);
    writer.write(`data: ${JSON.stringify({ messages, clientsCount: clients.length })}\n\n`);

    // Очистка при закрытии соединения
    const onClose = () => {
      console.log('Клиент отключился');
      clients = clients.filter(client => client !== writer);
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
  }
}

export async function POST(request) {
  try {
    const { newMessages = [], pinnedMessageId, unpin } = await request.json();

    if (!Array.isArray(newMessages)) {
      console.error('newMessages должен быть массивом');
      return NextResponse.json({ message: 'Неверные данные' }, { status: 400 });
    }

    // Обновление сообщений
    messages = [...messages, ...newMessages];

    if (pinnedMessageId !== undefined) {
      messages = messages.map((msg) =>
        msg.id === pinnedMessageId ? { ...msg, pinned: !unpin } : msg
      );
    }

    broadcastMessages();
    return NextResponse.json({ message: 'Сообщение обновлено' });
  } catch (error) {
    console.error('Ошибка при обновлении сообщения:', error);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}

// Функция для отправки сообщений всем клиентам
function broadcastMessages() {
  const messagePayload = {
    messages,
    clientsCount: clients.length
  };
  const messageData = `data: ${JSON.stringify(messagePayload)}\n\n`;

  clients.forEach(client => {
    client.write(messageData).catch(err => {
      console.error('Ошибка при отправке сообщения клиенту:', err);
      clients = clients.filter(c => c !== client);
    });
  });
}
