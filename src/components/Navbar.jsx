import React, { useState, useRef, useEffect } from 'react';
import { Search, LogOut, User, Home, Compass, ScanLine, Briefcase } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import psyduckLogo from '../assets/psyduck.png';

const NAV_ICONS = {
  dashboard: Home,
  explore: Compass,
  scan: ScanLine,
  portfolio: Briefcase,
};

export default function Navbar({ onNavigate, currentPage }) {
  const { user, profile, signOut } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const displayName = profile?.username || user?.email?.split('@')[0] || '?';
  const initial = displayName[0]?.toUpperCase() || '?';
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url;

  const navItems = [
    { key: 'dashboard', label: 'Home' },
    { key: 'explore', label: 'Explore' },
    { key: 'scan', label: 'Scan' },
    { key: 'portfolio', label: 'Portfolio' },
  ];

  return (
    <>
      {/* ── Desktop / Tablet: Top bar ── */}
      <nav className="hidden sm:block w-full bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => onNavigate('dashboard')}>
              <img src={psyduckLogo} alt="DuckDex" className="w-8 h-8 rounded-full object-cover" />
              <span className="text-lg font-bold tracking-tight text-gray-900">DuckDex</span>
            </div>

            {/* Nav Links */}
            <div className="flex items-center gap-1">
              {navItems.map(item => (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    currentPage === item.key || (item.key === 'explore' && currentPage === 'game')
                      ? 'text-blue-green'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Right side — user menu */}
            <div className="flex items-center gap-3 relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(v => !v)}
                className="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-green text-white flex items-center justify-center text-sm font-bold">
                    {initial}
                  </div>
                )}
                <span className="text-sm font-medium text-gray-700 max-w-[120px] truncate">{displayName}</span>
              </button>

              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
                  <div className="px-4 py-2.5 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
                    <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                  </div>
                  <button
                    onClick={() => { setShowMenu(false); signOut(); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={15} />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── Mobile: Top header (logo + avatar only) ── */}
      <div className="sm:hidden w-full bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="flex items-center justify-between h-12 px-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => onNavigate('dashboard')}>
            <img src={psyduckLogo} alt="DuckDex" className="w-7 h-7 rounded-full object-cover" />
            <span className="text-base font-bold tracking-tight text-gray-900">DuckDex</span>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(v => !v)}
              className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-green text-white flex items-center justify-center text-xs font-bold">
                  {initial}
                </div>
              )}
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={() => { setShowMenu(false); signOut(); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut size={15} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile: Bottom tab bar ── */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-around h-14">
          {navItems.map(item => {
            const Icon = NAV_ICONS[item.key];
            const active = currentPage === item.key || (item.key === 'explore' && currentPage === 'game');
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                  active ? 'text-blue-green' : 'text-gray-400'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
                <span className={`text-[10px] mt-0.5 ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
