import { SignJWT } from 'jose';
import pool from '/app/connection';
import { NextResponse } from 'next/server';

export async function POST(req) {
  let connection;
  try {
    const { name, phone, password, is_admin } = await req.json();

    connection = await pool.getConnection();

    // Проверяем, существует ли запись с данным именем и телефоном
    const [existingUser] = await connection.query(
      'SELECT * FROM Users WHERE name = ? AND phone = ?',
      [name, phone]
    );

    let user;

    if (existingUser.length > 0) {
      user = existingUser[0];
    } else {
      await connection.query(
        'INSERT INTO Users (name, phone, password, is_admin) VALUES (?, ?, ?, ?)',
        [name, phone, password, is_admin]
      );

      const [newUser] = await connection.query(
        'SELECT * FROM Users WHERE name = ? AND phone = ?',
        [name, phone]
      );

      user = newUser[0];
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
    if (connection) {
      connection.release();
    }
  }
}
