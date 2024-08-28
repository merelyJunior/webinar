"use client"
import { useState } from 'react';
import axios from 'axios';
import styles from './page.module.css'; 

const UserLogin = () => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    try {
      const response = await axios.post('/api/user_login', {
        name,
        phone,
        password: null,
        is_admin: 0,
      });

      if (response.status === 200) {
        setSuccess('Успешно вошли на вебинар.');
        window.location.href = '/stream';
      }
    } catch (err) {
      setError('Не удалось войти на вебинар.');
    }
  };

  return (
    <div className={styles.container}>
    <form className={styles.form} onSubmit={handleSubmit}>
      <label htmlFor="name">Имя:</label>
      <input
        type="text"
        id="name"
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <label htmlFor="phone">Телефон:</label>
      <input
        type="text"
        id="phone"
        name="phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        required
      />
      <button type="submit">Войти</button>

      {error && <p className={styles.error}>{error}</p>}
      {success && <p className={styles.success}>{success}</p>}
    </form>
  </div>
  );
}

export default UserLogin;
