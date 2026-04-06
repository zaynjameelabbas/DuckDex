
import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import HomePage from './pages/HomePage';
import GamePage from './pages/GamePage';
import PortfolioPage from './pages/PortfolioPage';
import ScannerPage from './pages/ScannerPage';

function AppContent() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState('dashboard');
  const [selectedGame, setSelectedGame] = useState(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-green rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  const handleSelectGame = (game) => {
    setSelectedGame(game);
    setPage('game');
  };

  const handleNavigate = (target) => {
    if (target === 'explore') {
      setSelectedGame(null);
    }
    setPage(target);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-body">
      <Navbar onNavigate={handleNavigate} currentPage={page} />
      {page === 'dashboard' && <DashboardPage onSelectGame={handleSelectGame} />}
      {page === 'explore' && <HomePage onSelectGame={handleSelectGame} />}
      {page === 'game' && selectedGame && (
        <GamePage game={selectedGame} onBack={() => handleNavigate('explore')} />
      )}
      {page === 'portfolio' && <PortfolioPage />}
      {page === 'scan' && <ScannerPage />}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
