import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DesktopLyricsWindow } from './DesktopLyricsWindow';
import './styles.css';

const desktopLyrics = window.location.hash === '#desktop-lyrics';
if (desktopLyrics) document.body.classList.add('desktop-lyrics-root');
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{desktopLyrics ? <DesktopLyricsWindow /> : <App />}</React.StrictMode>,
);
