import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('app');
if (!container) throw new Error('No se encontró el elemento #app en el HTML');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
