import { SignJWT } from 'jose';
import pool from '/app/connection'; // Ваше подключение к базе данных PostgreSQL
import { NextResponse } from 'next/server';

export async function POST(req) {
  const client = await pool.connect(); // Получаем клиента из пула
  try {
    const { name, phone, password, is_admin, streamEndSeconds } = await req.json();

    // Проверяем, существует ли запись с данным именем и телефоном
    const { rows: existingUser } = await client.query(
      'SELECT * FROM users WHERE name = $1 AND phone = $2',
      [name, phone]
    );

    let user;

    if (existingUser.length > 0) {
      user = existingUser[0];
    } else {
      const result = await client.query(
        'INSERT INTO users (name, phone, password, is_admin) VALUES ($1, $2, $3, $4) RETURNING *',
        [name, phone, password, is_admin]
      );

      user = result.rows[0];
    }

    let tokenExpirationTime;

    const now = Math.floor(Date.now() / 1000); // Текущее время в секундах

    if (streamEndSeconds && streamEndSeconds > now) {
      // Если стрим еще не завершен, добавляем 3600 секунд к времени окончания стрима
      tokenExpirationTime = streamEndSeconds + 3600;
    } else {
      // Если стрим завершен или не передан, используем стандартные 3600 секунд
      tokenExpirationTime = now + 3600;
    }

    // Создание JWT токена доступа
    const accessToken = await new SignJWT({ id: user.id, name: user.name, is_admin: user.is_admin })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setExpirationTime(tokenExpirationTime) // Устанавливаем рассчитанное время истечения токена
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    // Установка токена в куки
    const response = NextResponse.json({ message: 'Успешно вошли' });
    response.cookies.set('authToken', accessToken, {  maxAge: 3600 });

    return response;
  } catch (error) {
    console.error('Ошибка при обработке данных:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  } finally {
    client.release(); // Освобождаем клиент
  }
}
