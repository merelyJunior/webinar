import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // Считывание куки
  const cookieHeader = req.headers.get('cookie') || '';
  const cookies = Object.fromEntries(cookieHeader.split(';').map(cookie => {
    const [key, ...rest] = cookie.split('=');
    return [key.trim(), rest.join('=')];
  }));

  const token = cookies['authToken'] || '';

  console.log('Проверка пути:', pathname);
  console.log('Найденный токен:', token);

  // Определите публичные маршруты
  const publicPaths = ['/', '/admin', '/api/invite_link'];

  // Если маршрут публичный и не требует авторизации
  if (publicPaths.includes(pathname)) {
    console.log('Публичный маршрут:', pathname);

    // Если пользователь уже авторизован и пытается попасть на публичный маршрут
    if (token && pathname !== '/stream') {
      console.log('Пользователь авторизован, перенаправление на /stream');
      return NextResponse.redirect(new URL('/stream', req.url));
    }
    // Разрешаем доступ к публичным маршрутам
    return NextResponse.next();
  }

  // Проверка, если токена нет, перенаправляем на главную
  if (!token) {
    console.log('Токен не найден, перенаправление на /');
    return NextResponse.redirect(new URL('/', req.url));
  }

  try {
    // Проверяем валидность токена
    console.log('Проверка валидности токена');
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
    console.log('Токен валиден');
  } catch (err) {
    console.error('Token verification failed:', err);
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!|static|_next/static|_next/image|favicon.ico).*)'],
};
