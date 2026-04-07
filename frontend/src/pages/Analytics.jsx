import { useStore } from '../store/StoreContext';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#00D4AA', '#FFA502', '#FF4757', '#6C5CE7'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function heatColor(val, max) {
  if (!max || !val) return 'rgba(0,212,170,0.05)';
  const intensity = val / max;
  if (intensity > 0.7) return `rgba(255, 71, 87, ${0.3 + intensity * 0.6})`;
  if (intensity > 0.4) return `rgba(255, 165, 2, ${0.2 + intensity * 0.5})`;
  return `rgba(0, 212, 170, ${0.1 + intensity * 0.5})`;
}

export default function Analytics() {
  const { analytics, crossGym, selectedGymId, gyms, dateRange, setDateRange, loading } = useStore();
  const selectedGym = gyms.find(g => g.id === selectedGymId);

  if (!analytics || loading) {
    return (
      <div className="main-content">
        <div className="dashboard-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
          {[1,2,3,4].map(i => (
            <div key={i} className="card"><div className="skeleton skeleton-chart" /></div>
          ))}
        </div>
      </div>
    );
  }

  // Heatmap data
  const heatmapData = analytics.heatmap || [];
  const maxCount = Math.max(...heatmapData.map(h => h.checkin_count), 1);

  const getHeatVal = (dow, hour) => {
    const cell = heatmapData.find(h => h.day_of_week === dow && h.hour_of_day === hour);
    return cell?.checkin_count || 0;
  };

  // Revenue by plan for pie chart
  const revenueByPlan = (analytics.revenue_by_plan || []).map(r => ({
    name: r.plan_type.charAt(0).toUpperCase() + r.plan_type.slice(1),
    value: parseFloat(r.total),
  }));

  // New vs renewal for donut
  const newVsRenewal = (analytics.new_vs_renewal || []).map(r => ({
    name: r.payment_type === 'new' ? 'New Joiners' : 'Renewals',
    value: parseInt(r.count),
  }));

  // Cross-gym for bar chart
  const crossGymData = (crossGym || []).map(g => ({
    name: g.gym_name.replace('WTF Gyms — ', ''),
    revenue: parseFloat(g.total_revenue),
  }));

  const customTooltip = ({ active, payload }) => {
    if (active && payload?.length) {
      return (
        <div style={{background:'var(--bg-card)',padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',fontSize:12}}>
          <div style={{color:'var(--text-primary)',fontWeight:600}}>{payload[0].payload.name}</div>
          <div style={{color:'var(--accent)',fontFamily:'var(--font-mono)'}}>₹{payload[0].value?.toLocaleString('en-IN')}</div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="main-content">
      {/* Date Range Filter */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:16,fontWeight:600,color:'var(--text-primary)'}}>
          Analytics — {selectedGym?.name?.replace('WTF Gyms — ', '') || ''}
        </h2>
        <div className="date-filter">
          {['7d','30d','90d'].map(d => (
            <button key={d} className={`date-btn ${dateRange === d ? 'active' : ''}`} onClick={() => setDateRange(d)}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="dashboard-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
        {/* Peak Hours Heatmap */}
        <div className="card" style={{gridColumn:'1 / -1'}}>
          <div className="card-header">
            <span className="card-title">7-Day Peak Hours Heatmap</span>
          </div>
          <div className="heatmap-grid">
            {/* Hour labels */}
            <div />
            {Array.from({length: 24}, (_, i) => (
              <div key={i} className="heatmap-hour-label">{i}</div>
            ))}
            {/* Day rows */}
            {DAYS.map((day, dow) => (
              <>
                <div key={`label-${dow}`} className="heatmap-label">{day}</div>
                {Array.from({length: 24}, (_, hour) => {
                  const val = getHeatVal(dow, hour);
                  return (
                    <div key={`${dow}-${hour}`} className="heatmap-cell"
                      style={{background: heatColor(val, maxCount)}}
                      title={`${day} ${hour}:00 — ${val} check-ins`}
                    >
                      {val > 0 ? val : ''}
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>

        {/* Revenue by Plan Type */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Revenue by Plan Type</span>
          </div>
          {revenueByPlan.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={revenueByPlan} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`}>
                  {revenueByPlan.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => `₹${v.toLocaleString('en-IN')}`} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state"><div className="empty-state-text">No revenue data</div></div>
          )}
        </div>

        {/* New vs Renewal Donut */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">New vs Renewal Ratio</span>
          </div>
          {newVsRenewal.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={newVsRenewal} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`}>
                  {newVsRenewal.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state"><div className="empty-state-text">No membership data</div></div>
          )}
        </div>

        {/* Cross-Gym Revenue Comparison */}
        <div className="card" style={{gridColumn:'1 / -1'}}>
          <div className="card-header">
            <span className="card-title">Cross-Gym Revenue Comparison (30 Days)</span>
          </div>
          {crossGymData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={crossGymData} layout="vertical" margin={{left: 100}}>
                <XAxis type="number" tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} stroke="var(--text-muted)" />
                <YAxis type="category" dataKey="name" stroke="var(--text-muted)" width={100} tick={{fontSize:11}} />
                <Tooltip content={customTooltip} />
                <Bar dataKey="revenue" fill="var(--accent)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state"><div className="empty-state-text">No cross-gym data</div></div>
          )}
        </div>

        {/* Churn Risk Panel */}
        <div className="card" style={{gridColumn:'1 / -1'}}>
          <div className="card-header">
            <span className="card-title">Churn Risk Members</span>
            <span className="card-title" style={{color:'var(--danger)'}}>
              {analytics.churn_risk?.length || 0} at risk
            </span>
          </div>
          <div className="churn-list">
            {(!analytics.churn_risk || analytics.churn_risk.length === 0) ? (
              <div className="empty-state"><div className="empty-state-text">No churn risk members</div></div>
            ) : (
              analytics.churn_risk.slice(0, 50).map(member => {
                const daysAgo = Math.floor((Date.now() - new Date(member.last_checkin_at).getTime()) / 86400000);
                return (
                  <div key={member.id} className={`churn-item ${member.risk_level}`}>
                    <span>{member.name}</span>
                    <span style={{color:'var(--text-muted)',fontSize:12,fontFamily:'var(--font-mono)'}}>
                      {daysAgo} days ago
                    </span>
                    <span className={`risk-label ${member.risk_level}`}>
                      {member.risk_level?.toUpperCase()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
