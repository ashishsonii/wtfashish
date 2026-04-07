import { useStore } from '../store/StoreContext';
import { AnimatedNumber } from '../components/AnimatedNumber';

function getOccColor(pct) {
  if (pct > 85) return 'red';
  if (pct >= 60) return 'yellow';
  return 'green';
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function Dashboard() {
  const { gyms, selectedGymId, gymLive, summary, activityFeed, connected, loading } = useStore();

  const selectedGym = gyms.find(g => g.id === selectedGymId);
  const occupancy = gymLive?.current_occupancy ?? selectedGym?.current_occupancy ?? 0;
  const capacity = selectedGym?.capacity ?? 1;
  const capacityPct = Math.round((occupancy / capacity) * 100);
  const revenue = gymLive?.today_revenue ?? selectedGym?.today_revenue ?? 0;

  if (loading) {
    return (
      <div className="main-content">
        <div className="dashboard-grid">
          {[1,2,3].map(i => (
            <div key={i} className="card"><div className="skeleton skeleton-value" /><div className="skeleton skeleton-line" style={{width:'60%',marginTop:12}} /></div>
          ))}
        </div>
        <div className="dashboard-grid-wide">
          <div className="card"><div className="skeleton skeleton-chart" /></div>
          <div className="card"><div className="skeleton skeleton-chart" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      {/* KPI Cards */}
      <div className="dashboard-grid">
        {/* Occupancy */}
        <div className="card" id="occupancy-card">
          <div className="card-header">
            <span className="card-title">Live Occupancy</span>
            <div className="live-indicator">
              <span className={`live-dot ${connected ? 'connected' : 'disconnected'}`} />
              <span style={{color: connected ? 'var(--success)' : 'var(--danger)'}}>{connected ? 'LIVE' : 'OFFLINE'}</span>
            </div>
          </div>
          <div style={{display:'flex', alignItems:'baseline', gap: 12}}>
            <span className={`kpi-value ${getOccColor(capacityPct)}`} id="occupancy-value" data-testid="occupancy-count">
              <AnimatedNumber value={occupancy} />
            </span>
            <span className={`kpi-percentage ${getOccColor(capacityPct)}`}>
              {capacityPct}%
            </span>
          </div>
          <div className="kpi-subtitle">of {capacity} capacity — {selectedGym?.name || ''}</div>
        </div>

        {/* Revenue */}
        <div className="card" id="revenue-card">
          <div className="card-header">
            <span className="card-title">Today's Revenue</span>
            <span className="card-title" style={{color:'var(--accent)'}}>₹</span>
          </div>
          <span className="kpi-value green" id="revenue-value">
            <AnimatedNumber value={revenue} prefix="₹" />
          </span>
          <div className="kpi-subtitle">{selectedGym?.name || ''}</div>
        </div>

        {/* Quick Stats */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Active Anomalies</span>
          </div>
          <span className={`kpi-value ${summary.active_anomalies > 0 ? 'red' : 'green'}`}>
            <AnimatedNumber value={summary.active_anomalies} />
          </span>
          <div className="kpi-subtitle">{summary.active_anomalies > 0 ? 'Requires attention' : 'All systems normal'}</div>
        </div>
      </div>

      {/* Activity Feed + Gym Overview */}
      <div className="dashboard-grid-wide">
        {/* Activity Feed */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Live Activity Feed</span>
            <span className="card-title" style={{color:'var(--text-muted)'}}>{activityFeed.length} events</span>
          </div>
          <div className="activity-feed" id="activity-feed">
            {activityFeed.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <div className="empty-state-text">No recent activity. Start the simulator to see live events.</div>
              </div>
            ) : (
              activityFeed.map((item, idx) => (
                <div key={idx} className="activity-item" data-testid="activity-feed-item">
                  <div className={`activity-icon ${item.event_type}`}>
                    {item.event_type === 'checkin' ? '→' : item.event_type === 'checkout' ? '←' : '₹'}
                  </div>
                  <div className="activity-text">
                    <strong>{item.member_name}</strong>
                    {item.event_type === 'checkin' && ' checked in at '}
                    {item.event_type === 'checkout' && ' checked out from '}
                    {item.event_type === 'payment' && ` paid ₹${item.amount?.toLocaleString('en-IN') || ''} at `}
                    {item.gym_name?.replace('WTF Gyms — ', '')}
                  </div>
                  <span className="activity-time">{timeAgo(item.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* All Gyms Grid */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">All Gyms Overview</span>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {gyms.map(gym => {
              const gymPct = gym.capacity > 0 ? Math.round((gym.current_occupancy / gym.capacity) * 100) : 0;
              return (
                <div key={gym.id} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'8px 10px', borderRadius:8, background:'rgba(255,255,255,0.02)',
                  borderLeft: `3px solid ${gymPct > 85 ? 'var(--danger)' : gymPct >= 60 ? 'var(--warning)' : 'var(--success)'}`,
                  fontSize: 13,
                }}>
                  <span style={{flex:1}}>{gym.name.replace('WTF Gyms — ','')}</span>
                  <span className={`kpi-percentage ${getOccColor(gymPct)}`} style={{fontSize:11,marginRight:8}}>
                    {gym.current_occupancy}/{gym.capacity}
                  </span>
                  <span style={{color:'var(--accent)',fontFamily:'var(--font-mono)',fontSize:12}}>
                    ₹{(gym.today_revenue || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
