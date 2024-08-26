import { NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';

export async function POST(req) {
  try {
    const { refreshToken } = await req.json(); // Получаем refreshToken из запроса

    if (!refreshToken) {
      return NextResponse.json({ error: 'Токен обновления отсутствует' }, { status: 400 });
    }

    let payload;
    try {
      // Проверяем валидность refreshToken
      const { payload: decodedPayload } = await jwtVerify(refreshToken, new TextEncoder().encode(process.env.JWT_SECRET));
      payload = decodedPayload;
    } catch (error) {
      return NextResponse.json({ error: 'Неверный токен обновления' }, { status: 401 });
    }

    // Создаем новый accessToken
    const newAccessToken = await new SignJWT({ id: payload.id, name: payload.name, is_admin: payload.is_admin })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setExpirationTime('3min')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    // Создаем новый refreshToken
    const newRefreshToken = await new SignJWT({ id: payload.id })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setExpirationTime('5min')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    // Отправляем новый accessToken и refreshToken клиенту
    const response = NextResponse.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });

    // Устанавливаем новые токены в куки
    response.cookies.set('authToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
    });
    response.cookies.set('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
    });

    return response;

  } catch (error) {
    console.error('Ошибка при обновлении токена:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
