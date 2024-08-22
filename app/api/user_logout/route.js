  // app/api/logout/route.js

  export async function POST(request) {
    // Устанавливаем куки authToken и refreshToken с истекшим сроком действия для удаления
    const cookies = [
      `authToken=; HttpOnly; Secure; SameSite=Strict; Expires=${new Date(0).toUTCString()}; Path=/`,
      `refreshToken=; HttpOnly; Secure; SameSite=Strict; Expires=${new Date(0).toUTCString()}; Path=/`,
    ].join(', ');

    // Устанавливаем заголовок Set-Cookie
    const response = new Response(null, {
      status: 302, // Перенаправление
      headers: {
        'Set-Cookie': cookies,
        Location: '/', // Перенаправление на главную страницу
      },
    });

    return response;
  }
