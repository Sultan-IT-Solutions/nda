import { useEffect, useState } from 'react';

export default function App() {
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('http://127.0.0.1:8000/')
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
