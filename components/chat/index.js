import React, { useState, useEffect, useRef } from 'react';
import styles from './index.module.css';

const Chat = ({ isAdmin, setClientsCount, userName, setMessagesCount, setPopupState}) => {
  const [comment, setComment] = useState('');
  const [visibleMessages, setVisibleMessages] = useState([]);
  const [isUserScrolling, setIsUserScrolling] = useState(false);

  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/messages');
  
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.messageId !== undefined && data.pinned !== undefined) {
          // Если пришло обновление статуса pinned
          setVisibleMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === data.messageId ? { ...msg, pinned: data.pinned } : msg
            )
          );
        } else if (data.messages && data.messages.length > 0) {
          // Если пришли новые сообщения
          setVisibleMessages((prevMessages) => [
            ...prevMessages,
            ...data.messages
          ]);
          setClientsCount(data.clientsCount);
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
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
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
      text: comment.replace(/\n/g, '\\n'),
      sending_time: new Date().toISOString(),
      pinned: false
    };

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
      }
    } catch (error) {
      console.error('Ошибка при отправке сообщения:', error);
     
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
        body: JSON.stringify({ pinnedMessageId: message.id,  pinned: true }),
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
        body: JSON.stringify({ pinnedMessageId: message.id, pinned: false }),
      });
    } catch (error) {
      console.error('Ошибка при откреплении сообщения:', error);
    }
  };
  
  useEffect(() => {
    setMessagesCount((prevCount) => {
      if (prevCount !== visibleMessages.length) {
        return visibleMessages.length;
      }
      return prevCount;
    });
    
  }, [visibleMessages]);


  return (
    <div className={styles['chat-wrapper']}>
      <div className={styles['chat-inner']} ref={chatContainerRef} onScroll={handleScroll}  style={{ overflowY: 'auto', height: '100%' }}>
        {visibleMessages.length > 0 ? (
          visibleMessages.map((mess) => (
            <div
              className={`${styles.message} ${mess.pinned ? styles['pinned-message'] : ''}`}
              key={mess.id}
            >
              <div className={styles['message-data']}>
                <p className={styles['sender-name']}>{mess.sender}</p>
                <p className={styles['sending-time']}> {new Date(mess.sending_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <div className={styles['pinned-controls']}>
                {isAdmin && (
                  !mess.pinned ? (
                    <button className={styles['pin-btn']} onClick={() => handlePinMessage(mess)}>
                     
                    </button>
                  ) : (
                    <button className={styles['unpin-btn']} onClick={() => handleUnpinMessage(mess)}>
                  
                    </button>
                  )
                )}
                <p className={styles['message-text']}>
                  {mess.text.replace(/\\n/g, '\n').split('\n').map((line, index) => (
                    <React.Fragment key={index}>
                      {line}
                      <br />
                    </React.Fragment>
                  ))}
                </p>
              </div>
            </div>
          ))
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
            disabled={!isAdmin}
          ></textarea>
        </div>
        {!isAdmin && (
          <a className={styles['chat-login-btn']} onClick={() => setPopupState(true)}>Войти в чат</a>
        )}
        <button disabled={!isAdmin} type='button' className={styles.btn} onClick={handleMessageSend}>
          Отправить
        </button>
      </form>
    </div>
  );
};

export default Chat;
