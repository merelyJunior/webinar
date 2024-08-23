import { SignJWT } from 'jose';
import pool from '/app/connection'; // Убедитесь, что путь к `pool` правильный
import { NextResponse } from 'next/server';

export async function GET(req) {
  const client = await pool.connect(); // Получаем клиента из пула
  try {
    // http://localhost:3000/api/invite_link?name=&phone=
    const url = new URL(req.url);
    const name = url.searchParams.get('name');
    const phone = url.searchParams.get('phone');

    if (!name || !phone) {
      console.log('Не указаны имя или телефон');
      return NextResponse.json({ error: 'Не указаны имя или телефон' }, { status: 400 });
    }

    console.log('Соединение с базой данных установлено');

    const query = `
      SELECT * FROM users WHERE name = $1 AND phone = $2
    `;
    const { rows: existingUser } = await client.query(query, [name, phone]);
    console.log('Проверка существующего пользователя:', existingUser);

    let user;

    if (existingUser.length > 0) {
      user = existingUser[0];
      console.log('Пользователь уже существует:', user);
    } else {
      console.log('Пользователь не найден, создаем нового');
      const insertQuery = `
        INSERT INTO users (name, phone, password, is_admin) VALUES ($1, $2, $3, $4) RETURNING *
      `;
      const { rows: newUserRows } = await client.query(insertQuery, [name, phone, '', 0]);
      user = newUserRows[0];
      console.log('Новый пользователь создан:', user);
    }

    console.log('Создание JWT токенов');
    const accessToken = await new SignJWT({ id: user.id, name: user.name, is_admin: user.is_admin })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    const refreshToken = await new SignJWT({ id: user.id })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    console.log('JWT токены созданы:', { accessToken, refreshToken });

    const response = NextResponse.redirect(new URL('/stream', req.url));
    response.cookies.set('authToken', accessToken);
    response.cookies.set('refreshToken', refreshToken);

    console.log('Токены установлены в куки');

    return response;
  } catch (error) {
    console.error('Ошибка при обработке данных:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  } finally {
    client.release(); // Освобождаем клиента
    console.log('Соединение с базой данных закрыто');
  }
}
