import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/index.css';

// Note: StrictMode removed intentionally.
// It double-mounts effects which creates duplicate WebSocket connections,
// causing duplicated agent responses.
createRoot(document.getElementById('root')!).render(<App />);
