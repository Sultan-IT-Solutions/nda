import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://nda-backend-sigma.vercel.app';

export default function App() {
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/`)
      .then(res => res.json())
      .then(data => setMsg(JSON.stringify(data)))
      .catch(err => setMsg('API error: ' + err.message));
  }, []);

  return (
    <div>
      <h1>Frontend connected</h1>
      <pre>{msg}</pre>
    </div>
  );
}
