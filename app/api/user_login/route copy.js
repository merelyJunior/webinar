import { SignJWT } from 'jose';
import { NextResponse } from 'next/server';

// Имитация данных пользователей
const mockUsers = [];

// Функция для получения пользователя по имени и телефону
const getUserByNameAndPhone = (name, phone) => {
  return mockUsers.find(user => user.name === name && user.phone === phone);
};

export async function POST(req) {
  let connection;
  try {
    const { name, phone, password, is_admin } = await req.json();

    console.log('Received data:', { name, phone, password, is_admin });

    // Проверяем, существует ли запись с данным именем и телефоном
    let user = getUserByNameAndPhone(name, phone);

    if (!user) {
      // Добавляем нового пользователя
      user = { id: mockUsers.length + 1, name, phone, password, is_admin };
      mockUsers.push(user);
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
