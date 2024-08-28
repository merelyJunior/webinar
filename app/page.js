"use client";
import React, { useState, useEffect } from 'react';
import VimeoPlayer from '/components/vimeoPlayer';
import Header from '/components/header';
import Chat from '/components/chat';
import styles from './index.module.css';
import Link from 'next/link';
import Cookies from 'js-cookie';
import { decodeJwt } from 'jose';
import axios from 'axios';
import HeaderMobile from '/components/header_mobile';

const HomePage = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [startStream, setStartStream] = useState({
    delayTime: null,
    startTime: null,
    streamStatus: '',
    countdown: null,
  });
  const [userName, setUserName] = useState(null);
  const [userOnline, setUserOnline] = useState(null);
  const [counter, setCounter] = useState(null);
  const [windowWidth, setWindowWidth] = useState(0);

  const getStreamData = async () => {
    try {
      const response = await axios.get('/api/streams', { headers: { 'Cache-Control': 'no-cache' } });
      const newData = response.data;
      const { start_date, video_duration, scenario_id, video_id } = newData;
      return { start_date, video_duration, scenario_id, video_id };
    } catch (error) {
      console.error('Error fetching stream data:', error);
      return {};
    }
  };

  const initializeStream = async () => {
    try {
      const streamsData = await getStreamData();
  
      if (!streamsData || !streamsData.start_date) {
        console.error('No streams data available');
        return;
      }
  
      const { start_date, video_duration, scenario_id, video_id } = streamsData;
  
      const startTime = new Date(start_date);
  
      if (isNaN(startTime.getTime())) {
        console.error('Invalid start date');
        return;
      }
  
      const now = new Date();
      const duration = video_duration || 0;
      const streamEndTime = new Date(startTime);
      streamEndTime.setSeconds(streamEndTime.getSeconds() + duration);
      const streamEndSeconds = streamEndTime.getTime();
  
      let streamStatus = '';
      if (now < startTime) {
        streamStatus = 'notStarted';
      } else if (now > streamEndSeconds) {
        streamStatus = 'ended';
      } else {
        streamStatus = 'inProgress';
      }
      
      const delayTime = Math.max((now - startTime) / 1000, 0);
  
      setStartStream(prevState => {
        const updatedState = {
          ...prevState,
          delayTime,
          startTime,
          streamStatus,
          scenario_id,
          video_id,
        };
  
        if (streamStatus !== 'ended') {
          updatedState.streamEndSeconds = streamEndSeconds;
        }
  
        return updatedState;
      });
  
      if (streamStatus === 'notStarted') {
        const interval = setInterval(() => {
          const now = new Date();
          const timeDifference = startTime - now;
  
          if (timeDifference <= 0) {
            clearInterval(interval);
            setStartStream(prevState => ({
              ...prevState,
              countdown: '00:00:00',
              streamStatus: 'inProgress'
            }));
          } else {
            const hours = Math.floor(timeDifference / (1000 * 60 * 60));
            const minutes = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeDifference % (1000 * 60)) / 1000);
            setStartStream(prevState => ({
              ...prevState,
              countdown: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
            }));
          }
        }, 1000);
      }
  
    } catch (error) {
      console.error('Error initializing stream:', error);
    }
  };
  

  useEffect(() => {
    if (typeof window !== "undefined") {
      setWindowWidth(window.innerWidth);

      const handleResize = () => setWindowWidth(window.innerWidth);
      window.addEventListener('resize', handleResize);

      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  useEffect(() => {
    const token = Cookies.get('authToken');

    if (token) {
      try {
        const decodedToken = decodeJwt(token);
        const currentTime = Date.now() / 1000;
        if (decodedToken.exp < currentTime) {
          Cookies.remove('authToken');
          window.location.href = '/';
        } else {
          if (decodedToken.is_admin === 1) {
            setIsAdmin(true);
          }else{
            setUserName(decodedToken.name)
          }
        }
      } catch (error) {
        console.error('Ошибка при декодировании токена:', error);
        handleLogout();
        window.location.href = '/';
      }
    }
    initializeStream();
  }, []);
 

  const handleLogout = async () => {
    try {
      await fetch('/api/user_logout', {
        method: 'POST',
        credentials: 'include',
      });
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleClientsCount = (e) => {
    setUserOnline(e);
  };
  
  return (
    <section className={styles.homePage}>
      <div className={styles.inner}>
        {windowWidth <= 525 ? (
          <HeaderMobile isAdmin={isAdmin} userOnline={userOnline} />
        ) : (
          <Header isAdmin={isAdmin} userOnline={userOnline} />
        )}

        <div className={styles.container}>
          <div className={styles['player-container']}>
            <h1 className={styles['main-title']}>
              Название вебинара «Как зарабатывать на крипте сегодня, если не знаешь, на чем?»
            </h1>
            <VimeoPlayer startStream={startStream} />
            <Link className={styles.banner} href='https://www.google.com/' target="_blank">
              Кнопка или баннер
            </Link>
          </div>
          <div className={styles['comments-container']}>
            <h3 className={styles['comments-title']}>
              КОММЕНТАРИИ <span>({counter ? counter : 0})</span>
            </h3>
            <Chat streamEndSeconds={startStream.streamEndSeconds} isAdmin={isAdmin} setClientsCount={handleClientsCount} userName={userName} setMessagesCount={setCounter} />
          </div>
        </div>
        <p className={styles.copyright}>
          © 2024 - 100f.com
        </p>
      </div>
    </section>
  );
};

export default HomePage;
