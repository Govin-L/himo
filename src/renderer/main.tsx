import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DesktopLyricsWindow } from './DesktopLyricsWindow';
import { startNativeControlGlass } from './native-control-glass';
import './styles.css';

// Presentation only: reserve room for native macOS window controls in the unified header.
if (navigator.userAgent.includes('Macintosh')) document.documentElement.classList.add('platform-macos');
const desktopLyrics = window.location.hash === '#desktop-lyrics';
if (desktopLyrics) document.body.classList.add('desktop-lyrics-root');
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{desktopLyrics ? <DesktopLyricsWindow /> : <App />}</React.StrictMode>,
);
if (!desktopLyrics) startNativeControlGlass();
