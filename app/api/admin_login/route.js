import { SignJWT } from 'jose';
import { NextResponse } from 'next/server';

// Имитация данных пользователей
const mockUsers = [
  { id: 1, name: 'admin', password: 'password123', is_admin: true },
  { id: 2, name: 'user', password: 'password123', is_admin: false }
];

export async function POST(request) {
  try {
    const { username, password, is_admin } = await request.json();

    // Ищем пользователя в "базе данных"
    const user = mockUsers.find(
      user => user.name === username && user.password === password && user.is_admin === is_admin
    );

    if (!user) {
      return new NextResponse(JSON.stringify({ error: 'Неверный логин или пароль' }), { status: 401 });
    }

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
  } catch (error) {
    console.error('Ошибка при обработке данных:', error);
    return new NextResponse(JSON.stringify({ error: 'Ошибка сервера' }), { status: 500 });
  }
}

export async function GET() {
  return new NextResponse('Method GET Not Allowed', { status: 405 });
}
