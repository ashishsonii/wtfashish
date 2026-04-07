import { useStore } from '../store/StoreContext';

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Anomalies() {
  const { anomalies, dismissAnomaly } = useStore();

  const activeAnomalies = anomalies.filter(a => !a.resolved);
  const resolvedAnomalies = anomalies.filter(a => a.resolved);

  return (
    <div className="main-content">
      <h2 style={{fontSize:16,fontWeight:600,marginBottom:16}}>
        Anomaly Detection Log
        {activeAnomalies.length > 0 && (
          <span style={{color:'var(--danger)',marginLeft:8,fontSize:13}}>
            ({activeAnomalies.length} active)
          </span>
        )}
      </h2>

      {anomalies.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <div className="empty-state-text">No anomalies detected. All systems operating normally.</div>
          </div>
        </div>
      ) : (
        <div className="card" id="anomaly-table-card">
          <table className="anomaly-table">
            <thead>
              <tr>
                <th>Gym</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Message</th>
                <th>Detected</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {activeAnomalies.map(a => (
                <tr key={a.id || a.anomaly_id} className={`anomaly-row ${a.severity} ${a.severity === 'critical' ? 'critical-glow' : ''}`}>
                  <td style={{fontWeight:500}}>{(a.gym_name || '').replace('WTF Gyms — ', '')}</td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:11}}>{a.type || a.anomaly_type}</td>
                  <td><span className={`severity-badge ${a.severity}`}>{a.severity}</span></td>
                  <td style={{maxWidth:300,fontSize:12,color:'var(--text-secondary)'}}>{a.message}</td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:11,whiteSpace:'nowrap'}}>{timeAgo(a.detected_at)}</td>
                  <td><span className="severity-badge warning" style={{background:'rgba(255,71,87,0.15)',color:'var(--danger)'}}>ACTIVE</span></td>
                  <td>
                    {a.severity !== 'critical' ? (
                      <button className="btn-dismiss" onClick={() => dismissAnomaly(a.id || a.anomaly_id)}>
                        Dismiss
                      </button>
                    ) : (
                      <span style={{color:'var(--text-muted)',fontSize:11}}>Auto-resolve only</span>
                    )}
                  </td>
                </tr>
              ))}
              {resolvedAnomalies.map(a => (
                <tr key={a.id || a.anomaly_id} className="anomaly-row" style={{opacity:0.5}}>
                  <td>{(a.gym_name || '').replace('WTF Gyms — ', '')}</td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:11}}>{a.type || a.anomaly_type}</td>
                  <td><span className="severity-badge resolved">RESOLVED</span></td>
                  <td style={{maxWidth:300,fontSize:12,color:'var(--text-muted)'}}>{a.message}</td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:11}}>{timeAgo(a.detected_at)}</td>
                  <td><span className="severity-badge resolved">RESOLVED</span></td>
                  <td><span style={{color:'var(--text-muted)',fontSize:11}}>{timeAgo(a.resolved_at)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
