import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AtraccionesPage } from './pages/AtraccionesPage';
import { AtraccionDetail } from './pages/AtraccionDetail';
import { AutosPage } from './pages/AutosPage';
import { AutoDetail } from './pages/AutoDetail';
import { AdminDashboard } from './pages/AdminDashboard';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app-wrapper">
        <Navbar />
        <Routes>
          <Route path="/" element={<AtraccionesPage />} />
          <Route path="/atracciones/:id" element={<AtraccionDetail />} />
          <Route path="/autos" element={<AutosPage />} />
          <Route path="/autos/:id" element={<AutoDetail />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
