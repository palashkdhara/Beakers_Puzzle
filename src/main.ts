import './index.css';
import { GameOrchestrator } from './engine/Game';
import { registerServiceWorker } from './registerSW';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas element not found!');
    return;
  }

  // Initialize the main game loop and systems coordinator
  const game = new GameOrchestrator(canvas);

  // Register PWA service worker for offline support in production
  registerServiceWorker();

  // Export game reference globally for debug capabilities
  (window as any).game = game;
});

