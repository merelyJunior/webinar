// pages/api/checkToken.js (или другой путь в зависимости от вашей структуры)
export default function handler(req, res) {
  if (req.method === 'GET') {
    // Проверка наличия токена в cookies
    const token = req.cookies.authToken;

    if (!token) {
      // Если токен отсутствует, возвращаем ошибку
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Если токен есть, продолжаем обработку запроса
    // Здесь можно добавить логику для обработки запроса
    return res.status(200).json({ message: 'Success' });
  } else {
    // Обработка других методов
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
