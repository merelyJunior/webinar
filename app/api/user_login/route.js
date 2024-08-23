import { SignJWT } from 'jose';
import pool from '/app/connection'; // Ваше подключение к базе данных PostgreSQL
import { NextResponse } from 'next/server';

export async function POST(req) {
  const client = await pool.connect(); // Получаем клиента из пула
  try {
    const { name, phone, password, is_admin } = await req.json();

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

    // Создание JWT токена доступа
    const accessToken = await new SignJWT({ id: user.id, name: user.name, is_admin: user.is_admin })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    // Создание JWT токена обновления
    const refreshToken = await new SignJWT({ id: user.id })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    // Установка токенов в куки
    const response = NextResponse.json({ message: 'Успешно вошли' });
    response.cookies.set('authToken', accessToken);
    response.cookies.set('refreshToken', refreshToken);
    return response;
  } catch (error) {
    console.error('Ошибка при обработке данных:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  } finally {
    client.release(); // Освобождаем клиент
  }
}
