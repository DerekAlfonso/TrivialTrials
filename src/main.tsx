import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { Home } from './routes/Home';
import { GameRoute } from './routes/GameRoute';
import { BoardRoute } from './routes/BoardRoute';
import { unlockAudio } from './lib/sound';
import './index.css';

// Browsers require a gesture before audio can play; unlock on the first tap anywhere.
window.addEventListener('pointerdown', unlockAudio, { once: false, passive: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/join/:code" element={<Home mode="join" />} />
          <Route path="/tv" element={<Home mode="board" />} />
          <Route path="/play/:code" element={<GameRoute />} />
          <Route path="/board/:code" element={<BoardRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </StrictMode>,
);
