import React, { useState, useEffect, useRef } from 'react';
import styles from './index.module.css';

const Chat = ({ isAdmin, setClientsCount, userName }) => {
  const [comment, setComment] = useState('');
  const [visibleMessages, setVisibleMessages] = useState([]);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const sentMessageIds = useRef(new Set()); // Хранит ID отправленных сообщений

  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/messages');

    eventSource.onmessage = (event) => {
      try {
        const { messages, clientsCount } = JSON.parse(event.data);

        console.log('Получено сообщение через SSE:', messages);

        setClientsCount(clientsCount);
        if (messages) {
          setVisibleMessages((prevMessages) => {
            console.log('Предыдущие сообщения:', prevMessages);
            const prevMessageIds = new Set(prevMessages.map((msg) => msg.id));
            const uniqueNewMessages = messages.filter((msg) => {
              if (prevMessageIds.has(msg.id)) {
                console.log(`Сообщение с id ${msg.id} уже существует и не будет добавлено.`);
                return false;
              }
              if (sentMessageIds.current.has(msg.id)) {
                console.log(`Сообщение с id ${msg.id} было отправлено с этого клиента и не будет добавлено.`);
                sentMessageIds.current.delete(msg.id); // Удаляем из временного списка отправленных сообщений
                return false;
              }
              return true;
            });
            console.log('Новые уникальные сообщения для добавления в состояние:', uniqueNewMessages);
            return [...uniqueNewMessages, ...prevMessages];
          });
        }
      } catch (error) {
        console.error('Ошибка при обработке сообщений SSE:', error);
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    if (!isUserScrolling) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [visibleMessages, isUserScrolling]);

  const handleCommentChange = (e) => {
    setComment(e.target.value);
  };

  const handleMessageSend = async () => {
    if (comment.trim() === '') return;

    const tempMessage = {
      id: Date.now(),
      sender: !isAdmin ? userName : 'Модератор',
      text: comment,
      sendingTime: new Date().toLocaleTimeString(),
      pinned: false
    };

    console.log('Отправляем сообщение на сервер:', tempMessage);

    setVisibleMessages((prevMessages) => {
      console.log('Добавляем временное сообщение в состояние:', tempMessage);
      return [tempMessage, ...prevMessages];
    });

    // Добавляем ID сообщения в ref, чтобы игнорировать его при получении через SSE
    sentMessageIds.current.add(tempMessage.id);

    setComment('');

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newMessages: [tempMessage] })
      });

      if (response.ok) {
        const serverResponse = await response.json();
        console.log('Ответ сервера с сообщением:', serverResponse);
      } else {
        console.error('Ошибка при отправке сообщения');
        // Удаление временного сообщения в случае ошибки
        setVisibleMessages((prevMessages) => prevMessages.filter(msg => msg.id !== tempMessage.id));
        sentMessageIds.current.delete(tempMessage.id); // Удаляем ID из ref, т.к. сообщение не отправлено успешно
      }
    } catch (error) {
      console.error('Ошибка при отправке сообщения:', error);
      // Удаление временного сообщения в случае ошибки
      setVisibleMessages((prevMessages) => prevMessages.filter(msg => msg.id !== tempMessage.id));
      sentMessageIds.current.delete(tempMessage.id); // Удаляем ID из ref, т.к. сообщение не отправлено успешно
    }
  };

  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      setIsUserScrolling(scrollTop + clientHeight < scrollHeight - 50);
    }
  };

  const handlePinMessage = async (message) => {
    const updatedMessages = visibleMessages.map((msg) =>
      msg.id === message.id ? { ...msg, pinned: true } : msg
    );
    setVisibleMessages(updatedMessages);

    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinnedMessageId: message.id }),
      });
    } catch (error) {
      console.error('Ошибка при закреплении сообщения:', error);
    }
  };

  const handleUnpinMessage = async (message) => {
    const updatedMessages = visibleMessages.map((msg) =>
      msg.id === message.id ? { ...msg, pinned: false } : msg
    );
    setVisibleMessages(updatedMessages);

    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinnedMessageId: message.id, unpin: true }),  // Добавили флаг unpin
      });
    } catch (error) {
      console.error('Ошибка при откреплении сообщения:', error);
    }
  };

  return (
    <div className={styles['chat-wrapper']}>
      <div className={styles['chat-inner']} ref={chatContainerRef} onScroll={handleScroll}>
        {visibleMessages.length > 0 ? (
          visibleMessages.map((mess) => (
            <div
              className={`${styles.message} ${mess.pinned ? styles['pinned-message'] : ''}`}
              key={mess.id}
            >
              <div className={styles['message-data']}>
                <p className={styles['sender-name']}>{mess.sender}</p>
                <p className={styles['sending-time']}>{mess.sendingTime}</p>
              </div>
              <div className={styles['pinned-controls']}>
                {isAdmin && (
                  !mess.pinned ? (
                    <button className={styles['pin-btn']} onClick={() => handlePinMessage(mess)}>
                      Закрепить
                    </button>
                  ) : (
                    <button className={styles['unpin-btn']} onClick={() => handleUnpinMessage(mess)}>
                      Открепить
                    </button>
                  )
                )}
                <p className={styles['message-text']}>{mess.text}</p>
              </div>
            </div>
          )).reverse()
        ) : (
          <p>Нет сообщений</p>
        )}
        <div ref={chatEndRef} />
      </div>
      <form>
        <div className={styles['form-input']}>
          <textarea 
            className={styles.textarea} 
            placeholder='Ваш комментарий' 
            value={comment} 
            onChange={handleCommentChange}
          ></textarea>
        </div>
        <button type='button' className={styles.btn} onClick={handleMessageSend}>
          Отправить
        </button>
      </form>
    </div>
  );
};

export default Chat;
