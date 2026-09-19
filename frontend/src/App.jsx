import { useState } from 'react';
import { AtraccionesPage } from './pages/AtraccionesPage';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import './index.css';

function App() {
  return (
    <div className="app-wrapper">
      <Navbar />
      <AtraccionesPage />
      <Footer />
    </div>
  );
}

export default App;
