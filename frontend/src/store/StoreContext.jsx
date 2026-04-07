import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

const StoreContext = createContext(null);

const API_BASE = '/api';

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

export function StoreProvider({ children }) {
  const { connected, lastMessage, snapshot } = useWebSocket();

  // State
  const [gyms, setGyms] = useState([]);
  const [selectedGymId, setSelectedGymId] = useState(null);
  const [gymLive, setGymLive] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [anomalyCount, setAnomalyCount] = useState(0);
  const [summary, setSummary] = useState({ total_checked_in: 0, total_revenue: 0, active_anomalies: 0 });
  const [activityFeed, setActivityFeed] = useState([]);
  const [crossGym, setCrossGym] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [simStatus, setSimStatus] = useState('paused');
  const [simSpeed, setSimSpeed] = useState(1);
  const [dateRange, setDateRange] = useState('30d');
  const [activePage, setActivePage] = useState('dashboard');

  const feedRef = useRef(activityFeed);
  feedRef.current = activityFeed;

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      const [gymsData, summaryData, anomaliesData] = await Promise.all([
        apiFetch('/gyms'),
        apiFetch('/gyms/summary'),
        apiFetch('/anomalies'),
      ]);
      setGyms(gymsData);
      setSummary(summaryData);
      setAnomalies(anomaliesData);
      setAnomalyCount(anomaliesData.length);
      if (!selectedGymId && gymsData.length > 0) {
        setSelectedGymId(gymsData[0].id);
      }
      setLoading(false);
    } catch (err) {
      console.error('Failed to load data:', err);
      setTimeout(loadData, 3000);
    }
  }, [selectedGymId]);

  useEffect(() => { loadData(); }, []);

  // Load gym-specific data when gym changes
  useEffect(() => {
    if (!selectedGymId) return;
    const loadGym = async () => {
      try {
        const [liveData, activityData] = await Promise.all([
          apiFetch(`/gyms/${selectedGymId}/live`),
          apiFetch('/analytics/activity?limit=20'),
        ]);
        setGymLive(liveData);
        setActivityFeed(activityData);
      } catch (err) {
        console.error('Failed to load gym data:', err);
      }
    };
    loadGym();
  }, [selectedGymId]);

  // Load analytics when gym or date range changes
  useEffect(() => {
    if (!selectedGymId || activePage !== 'analytics') return;
    const loadAnalytics = async () => {
      try {
        const [analyticsData, crossGymData] = await Promise.all([
          apiFetch(`/gyms/${selectedGymId}/analytics?dateRange=${dateRange}`),
          apiFetch('/analytics/cross-gym'),
        ]);
        setAnalytics(analyticsData);
        setCrossGym(crossGymData);
      } catch (err) {
        console.error('Failed to load analytics:', err);
      }
    };
    loadAnalytics();
  }, [selectedGymId, dateRange, activePage]);

  // Handle WebSocket snapshot
  useEffect(() => {
    if (snapshot) {
      setGyms(snapshot.gyms || []);
      setSummary(snapshot.summary || summary);
      setAnomalies(snapshot.anomalies || []);
      setAnomalyCount(snapshot.anomalies?.length || 0);
    }
  }, [snapshot]);

  // Handle real-time WebSocket events
  useEffect(() => {
    if (!lastMessage || lastMessage.type === 'INITIAL_SNAPSHOT') return;

    const msg = lastMessage;

    switch (msg.type) {
      case 'CHECKIN_EVENT': {
        // Update gym occupancy
        setGyms(prev => prev.map(g =>
          g.id === msg.gym_id ? { ...g, current_occupancy: msg.current_occupancy } : g
        ));
        if (gymLive && gymLive.gym?.id === msg.gym_id) {
          setGymLive(prev => prev ? {
            ...prev,
            current_occupancy: msg.current_occupancy,
            capacity_pct: msg.capacity_pct,
          } : prev);
        }
        // Update summary
        setSummary(prev => ({ ...prev, total_checked_in: prev.total_checked_in + 1 }));
        // Add to feed
        setActivityFeed(prev => [{
          event_type: 'checkin', member_name: msg.member_name,
          gym_name: gyms.find(g => g.id === msg.gym_id)?.name || '', timestamp: msg.timestamp, gym_id: msg.gym_id,
        }, ...prev].slice(0, 20));
        break;
      }
      case 'CHECKOUT_EVENT': {
        setGyms(prev => prev.map(g =>
          g.id === msg.gym_id ? { ...g, current_occupancy: msg.current_occupancy } : g
        ));
        if (gymLive && gymLive.gym?.id === msg.gym_id) {
          setGymLive(prev => prev ? {
            ...prev,
            current_occupancy: msg.current_occupancy,
            capacity_pct: msg.capacity_pct,
          } : prev);
        }
        setSummary(prev => ({ ...prev, total_checked_in: Math.max(0, prev.total_checked_in - 1) }));
        setActivityFeed(prev => [{
          event_type: 'checkout', member_name: msg.member_name,
          gym_name: gyms.find(g => g.id === msg.gym_id)?.name || '', timestamp: msg.timestamp, gym_id: msg.gym_id,
        }, ...prev].slice(0, 20));
        break;
      }
      case 'PAYMENT_EVENT': {
        setGyms(prev => prev.map(g =>
          g.id === msg.gym_id ? { ...g, today_revenue: msg.today_total } : g
        ));
        if (gymLive && gymLive.gym?.id === msg.gym_id) {
          setGymLive(prev => prev ? { ...prev, today_revenue: msg.today_total } : prev);
        }
        setSummary(prev => ({ ...prev, total_revenue: prev.total_revenue + msg.amount }));
        setActivityFeed(prev => [{
          event_type: 'payment', member_name: msg.member_name,
          gym_name: gyms.find(g => g.id === msg.gym_id)?.name || '', timestamp: new Date().toISOString(),
          gym_id: msg.gym_id, amount: msg.amount,
        }, ...prev].slice(0, 20));
        break;
      }
      case 'ANOMALY_DETECTED': {
        setAnomalies(prev => [msg, ...prev]);
        setAnomalyCount(prev => prev + 1);
        setSummary(prev => ({ ...prev, active_anomalies: prev.active_anomalies + 1 }));
        setToasts(prev => [...prev, { id: Date.now(), severity: msg.severity, message: msg.message }]);
        setTimeout(() => setToasts(prev => prev.slice(1)), 5000);
        break;
      }
      case 'ANOMALY_RESOLVED': {
        setAnomalies(prev => prev.map(a =>
          a.anomaly_id === msg.anomaly_id || a.id === msg.anomaly_id
            ? { ...a, resolved: true, resolved_at: msg.resolved_at } : a
        ));
        setAnomalyCount(prev => Math.max(0, prev - 1));
        setSummary(prev => ({ ...prev, active_anomalies: Math.max(0, prev.active_anomalies - 1) }));
        break;
      }
    }
  }, [lastMessage]);

  // Simulator controls
  const startSimulator = async (speed = 1) => {
    try {
      const res = await fetch(`${API_BASE}/simulator/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed }),
      });
      const data = await res.json();
      setSimStatus(data.status);
      setSimSpeed(speed);
    } catch (err) { console.error('Start sim error:', err); }
  };

  const stopSimulator = async () => {
    try {
      const res = await fetch(`${API_BASE}/simulator/stop`, { method: 'POST' });
      const data = await res.json();
      setSimStatus(data.status);
    } catch (err) { console.error('Stop sim error:', err); }
  };

  const resetSimulator = async () => {
    try {
      const res = await fetch(`${API_BASE}/simulator/reset`, { method: 'POST' });
      const data = await res.json();
      setSimStatus(data.status);
      loadData();
    } catch (err) { console.error('Reset sim error:', err); }
  };

  const dismissAnomaly = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/anomalies/${id}/dismiss`, { method: 'PATCH' });
      if (res.status === 403) { alert('Critical anomalies cannot be dismissed'); return; }
      setAnomalies(prev => prev.filter(a => a.id !== id && a.anomaly_id !== id));
      setAnomalyCount(prev => Math.max(0, prev - 1));
    } catch (err) { console.error('Dismiss error:', err); }
  };

  const value = {
    connected, gyms, selectedGymId, setSelectedGymId, gymLive, analytics,
    anomalies, anomalyCount, summary, activityFeed, crossGym, toasts,
    loading, simStatus, simSpeed, dateRange, setDateRange, activePage, setActivePage,
    startSimulator, stopSimulator, resetSimulator, dismissAnomaly,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be inside StoreProvider');
  return ctx;
}
