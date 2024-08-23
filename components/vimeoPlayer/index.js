import React, { useEffect, useRef, useState } from 'react';
import Player from '@vimeo/player';
import styles from './index.module.css';
import axios from 'axios';

const VimeoPlayer = ({ startStream }) => {
  const playerRef = useRef(null);
  const [player, setPlayer] = useState(null);
  const [isPlayed, setIsPlayed] = useState(false);
  const [quality, setQuality] = useState('720p');
  const [showPopup, setShowPopup] = useState(false);
  const [streamStatus, setStreamStatus] = useState(startStream.streamStatus);

  const [timings, setTimings] = useState([]);
  const [message, setMessage] = useState('');
  const [dataFetched, setDataFetched] = useState(false);

  useEffect(() => {
    if (playerRef.current && !player) {
      const newPlayer = new Player(playerRef.current, {
        id: startStream.video_id,
        width: 855,
        height: 480,
        controls: false,
        quality,
      });

      setPlayer(newPlayer);

      newPlayer.on('loaded', () => {
        if (streamStatus === 'inProgress' && startStream.startTime > 0) {
          newPlayer.setCurrentTime(startStream.delayTime).catch((error) => {
            console.error('Error setting current time:', error);
          });
        }
      });

      newPlayer.on('timeupdate', ({ seconds }) => {
        if (timings.includes(Math.round(seconds))) {
          setShowPopup(true);
          setTimeout(() => setShowPopup(false), 3000);
        }
      });

      newPlayer.on('ended', () => {
        setStreamStatus('ended');
      });

      newPlayer.on('error', (error) => {
        console.error('Vimeo player error:', error);
      });
    }
  }, [player, startStream, quality, timings, streamStatus]);

  useEffect(() => {
    if (startStream && startStream.scenario_id && !dataFetched) {
      axios.post('/api/get_sales', { scenarioId: startStream.scenario_id })
        .then(response => {
          const { scenario_sales } = response.data;
          if (scenario_sales && scenario_sales.length > 0) {
            const { showAt, text } = scenario_sales[0];
            setTimings(showAt);
            setMessage(text);
          }
          setDataFetched(true); 
        })
        .catch(error => {
          setDataFetched(true);
          console.error('Ошибка при выполнении запроса:', error);
        });
    }
  }, [startStream, dataFetched]);

  const handlePlayClick = () => {
    if (player) {
      player.play().then(() => {
        setIsPlayed(true);
      }).catch((error) => {
        console.error('Error starting playback:', error);
      });
    }
  };

  const handleQualityChange = (event) => {
    const selectedQuality = event.target.value;
    if (player) {
      player.setQuality(selectedQuality).then(() => {
        setQuality(selectedQuality);
      }).catch((error) => {
        console.error('Error changing quality:', error);
      });
    }
  };

  const renderStreamStatus = () => {
    switch (streamStatus) {
      case 'notStarted':
        return (
          <div className={styles['stream-not-started']}>
            <>Трансляция начнётся через: {startStream.countdown}</>
          </div>
        );
      case 'inProgress':
        return (
          <>
            <div ref={playerRef} className={styles.player}>
              {!isPlayed && (
                <button className={styles['play-btn']} onClick={handlePlayClick}></button>
              )}
              <div className={styles['quality-selector']}>
                <label htmlFor="quality">Quality: </label>
                <select id="quality" onChange={handleQualityChange} value={quality}>
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                  <option value="540p">480p</option>
                  <option value="360p">360p</option>
                  <option value="240p">240p</option>
                </select>
              </div>
            </div>
          </>
        );
      case 'ended':
        return (
          <div className={styles['stream-end']}>
            <p>Трансляция завершена</p>
          </div>
        );
      default:
        return <div className={styles['stream-end']}></div>;
    }
  };

  return (
    <div className={styles.player}>
      {renderStreamStatus()}
      <div className={`${styles.popup} ${showPopup ? styles.showPopup : ''}`}>
        {message}
      </div> 
    </div>
  );
};

export default VimeoPlayer;
