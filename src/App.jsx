import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  KanbanSquare, 
  WalletCards, 
  Dumbbell, 
  Plus 
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import Pipelines from './components/Pipelines';
import MoneyTracker from './components/MoneyTracker';
import HabitsTracker from './components/HabitsTracker';
import QuickLogModal from './components/QuickLogModal';
import Login from './components/Login';
import { supabase } from './utils/supabaseClient';

export default function App() {
  const [session, setSession] = useState(null);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [activeLeadId, setActiveLeadId] = useState(null);
  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Cross-screen navigation bridge
  const handleNavigateToLead = (leadId) => {
    setActiveLeadId(leadId);
    setCurrentTab('pipelines');
  };

  const handleNavigate = (tab) => {
    setCurrentTab(tab);
  };

  if (!session) {
    return <Login onAuthSuccess={(user) => setSession({ user })} />;
  }

  return (
    <div className="app-container">
      {/* Gym Title Banner */}
      <header style={{ 
        padding: '16px 20px', 
        borderBottom: '1px solid var(--border)', 
        backgroundColor: 'var(--bg-panel)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ 
            background: 'var(--amber)', 
            color: 'var(--bg-darker)', 
            padding: '4px 8px', 
            borderRadius: '4px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            fontSize: '14px'
          }}>
            GOE
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' }}>
            EARTH <span style={{ color: 'var(--amber)' }}>CRM</span>
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Dumbbell size={12} color="var(--amber)" />
            <span>TRAIN YOUR BUSINESS LIKE YOUR BODY</span>
          </div>
          <button 
            type="button"
            onClick={() => supabase.auth.signOut()}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--red)', 
              fontSize: '11px', 
              fontFamily: 'var(--font-mono)', 
              cursor: 'pointer',
              textTransform: 'uppercase',
              fontWeight: 'bold',
              textDecoration: 'underline',
              padding: 0
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '16px' }}>
        {currentTab === 'dashboard' && (
          <Dashboard 
            onNavigateToLead={handleNavigateToLead} 
            onNavigate={handleNavigate}
          />
        )}
        {currentTab === 'pipelines' && (
          <Pipelines 
            activeLeadId={activeLeadId} 
            clearActiveLeadId={() => setActiveLeadId(null)}
          />
        )}
        {currentTab === 'money' && (
          <MoneyTracker />
        )}
        {currentTab === 'habits' && (
          <HabitsTracker />
        )}
      </main>

      {/* Floating Action Button */}
      <button className="fab-btn" onClick={() => setIsQuickLogOpen(true)} title="Quick Record Log">
        <Plus size={28} />
      </button>

      {/* Bottom Navigation Bar */}
      <nav className="bottom-nav">
        <button 
          className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleNavigate('dashboard')}
        >
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </button>
        
        <button 
          className={`nav-item ${currentTab === 'pipelines' ? 'active' : ''}`}
          onClick={() => handleNavigate('pipelines')}
        >
          <KanbanSquare size={20} />
          <span>Pipelines</span>
        </button>
        
        <button 
          className={`nav-item ${currentTab === 'money' ? 'active' : ''}`}
          onClick={() => handleNavigate('money')}
        >
          <WalletCards size={20} />
          <span>Money</span>
        </button>
        
        <button 
          className={`nav-item ${currentTab === 'habits' ? 'active' : ''}`}
          onClick={() => handleNavigate('habits')}
        >
          <Dumbbell size={20} />
          <span>Habits</span>
        </button>
      </nav>

      {/* Global Quick Action Dialog */}
      <QuickLogModal 
        isOpen={isQuickLogOpen} 
        onClose={() => setIsQuickLogOpen(false)} 
      />
    </div>
  );
}
