import { StoreProvider, useStore } from './store/StoreContext';
import { AnimatedNumber } from './components/AnimatedNumber';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import Anomalies from './pages/Anomalies';

function AppContent() {
  const {
    gyms, selectedGymId, setSelectedGymId, anomalyCount, summary, connected,
    activePage, setActivePage, simStatus, simSpeed,
    startSimulator, stopSimulator, resetSimulator, toasts,
  } = useStore();

  return (
    <div className="app-layout">
      {/* Navigation */}
      <nav className="navbar">
        <div className="navbar-brand">
          <div className="navbar-logo">WTF<span> LivePulse</span></div>
        </div>
        <div className="navbar-nav">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'analytics', label: 'Analytics' },
            { id: 'anomalies', label: 'Anomalies' },
          ].map(tab => (
            <button key={tab.id} className={`nav-tab ${activePage === tab.id ? 'active' : ''}`}
              onClick={() => setActivePage(tab.id)} id={`nav-${tab.id}`}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="nav-right">
          <div className="live-indicator">
            <span className={`live-dot ${connected ? 'connected' : 'disconnected'}`} />
            <span style={{color: connected ? 'var(--success)' : 'var(--danger)', fontSize: 11}}>
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
          <button className="anomaly-badge" onClick={() => setActivePage('anomalies')} id="anomaly-badge-btn" data-testid="anomaly-badge">
            🔔 Anomalies
            {anomalyCount > 0 && <span className="count">{anomalyCount}</span>}
          </button>
        </div>
      </nav>

      {/* Summary Bar */}
      <div className="summary-bar">
        <div className="summary-item">
          <span className="summary-label">Total Checked In (All Gyms)</span>
          <span className="summary-value" id="total-checked-in">
            <AnimatedNumber value={summary.total_checked_in} />
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Today's Revenue (All Gyms)</span>
          <span className="summary-value" style={{color:'var(--accent)'}} id="total-revenue">
            <AnimatedNumber value={summary.total_revenue} prefix="₹" />
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Active Anomalies</span>
          <span className="summary-value" style={{color: summary.active_anomalies > 0 ? 'var(--danger)' : 'var(--success)'}} id="total-anomalies">
            <AnimatedNumber value={summary.active_anomalies} />
          </span>
        </div>
      </div>

      {/* Gym Selector */}
      <div className="gym-selector" id="gym-selector" data-testid="gym-selector">
        {gyms.map(gym => (
          <button key={gym.id}
            className={`gym-chip ${selectedGymId === gym.id ? 'active' : ''}`}
            onClick={() => setSelectedGymId(gym.id)}
            data-testid="gym-option"
            id={`gym-chip-${gym.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
          >
            {gym.name.replace('WTF Gyms — ', '')} ({gym.current_occupancy || 0})
          </button>
        ))}
      </div>

      {/* Simulator Controls */}
      <div className="sim-controls" id="simulator-controls">
        <span style={{fontSize:12,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',letterSpacing:1}}>
          Simulator
        </span>
        {simStatus === 'running' ? (
          <button className="sim-btn stop" onClick={stopSimulator} data-testid="simulator-stop">⏸ Pause</button>
        ) : (
          <button className="sim-btn start" onClick={() => startSimulator(simSpeed)} data-testid="simulator-start">▶ Start</button>
        )}
        <button className="sim-btn reset" onClick={resetSimulator}>↻ Reset</button>
        <div className="speed-selector">
          {[1, 5, 10].map(s => (
            <button key={s}
              className={`speed-btn ${simSpeed === s ? 'active' : ''}`}
              onClick={() => startSimulator(s)}
            >
              {s}x
            </button>
          ))}
        </div>
        <div className="live-indicator" style={{marginLeft:8}}>
          <span className={`live-dot ${simStatus === 'running' ? 'connected' : 'disconnected'}`} />
          <span style={{fontSize:11,color: simStatus === 'running' ? 'var(--success)' : 'var(--text-muted)'}}>
            {simStatus === 'running' ? `Running ${simSpeed}x` : 'Paused'}
          </span>
        </div>
      </div>

      {/* Page Content */}
      {activePage === 'dashboard' && <Dashboard />}
      {activePage === 'analytics' && <Analytics />}
      {activePage === 'anomalies' && <Anomalies />}

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.severity}`}>
            ⚠️ {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}
