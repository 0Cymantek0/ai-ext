import React from 'react';
import ReactDOM from 'react-dom/client';
import { ZorkGame } from './zork';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ZorkGame />
    </React.StrictMode>
  );
} else {
  console.error('Zork: Root element not found!');
}
