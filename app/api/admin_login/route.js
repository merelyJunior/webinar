import { SignJWT } from 'jose';
import pool from '/app/connection';
import { NextResponse } from 'next/server';

export async function POST(request) {
  let connection;
  try {
    const { username, password, is_admin } = await request.json();

    connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        'SELECT * FROM users WHERE name = ? AND password = ? AND is_admin = ?',
        [username, password, is_admin]
      );

      if (rows.length === 0) {
        return new NextResponse(JSON.stringify({ error: 'Неверный логин или пароль' }), { status: 401 });
      }
      const user = rows[0];

      // Создание JWT токена доступа
      const accessToken = await new SignJWT({ id: user.id, username: user.name, is_admin: user.is_admin })
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
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Ошибка при обработке данных:', error);
    return new NextResponse(JSON.stringify({ error: 'Ошибка сервера' }), { status: 500 });
  }
}

export async function GET() {
  return new NextResponse('Method GET Not Allowed', { status: 405 });
}
