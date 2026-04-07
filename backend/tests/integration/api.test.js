// Integration Tests — API Endpoints
// Tests HTTP responses and structure using Supertest

const request = require('supertest');

// Mock the pool before requiring the app
const mockPool = {
  query: jest.fn(),
  on: jest.fn(),
};

jest.mock('../../src/db/pool', () => mockPool);

// Mock the anomaly detector to prevent it from starting
jest.mock('../../src/jobs/anomalyDetector', () => ({
  startAnomalyDetector: jest.fn(),
  stopAnomalyDetector: jest.fn(),
}));

// Mock the websocket server
jest.mock('../../src/websocket/server', () => ({
  setupWebSocket: jest.fn(),
  broadcast: jest.fn(),
}));

const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/gyms', require('../../src/routes/gyms'));
app.use('/api/anomalies', require('../../src/routes/anomalies'));
app.use('/api/simulator', require('../../src/routes/simulator'));
app.use('/api/analytics', require('../../src/routes/analytics'));

describe('API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/gyms', () => {
    test('should return list of gyms with correct structure', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'g1', name: 'WTF Gyms — Bandra West', city: 'Mumbai', capacity: 300, status: 'active', current_occupancy: '25', today_revenue: '45000', opens_at: '05:00', closes_at: '23:00' },
          { id: 'g2', name: 'WTF Gyms — Velachery', city: 'Chennai', capacity: 110, status: 'active', current_occupancy: '0', today_revenue: '1500', opens_at: '06:00', closes_at: '21:00' },
        ]
      });

      const res = await request(app).get('/api/gyms');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('capacity');
      expect(res.body[0]).toHaveProperty('current_occupancy');
      expect(res.body[0]).toHaveProperty('today_revenue');
    });

    test('should return empty array when no gyms exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/gyms');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('should return 200 with array response type', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'g1', name: 'Test Gym', city: 'City', capacity: 100, status: 'active', current_occupancy: '10', today_revenue: '5000' }]
      });
      const res = await request(app).get('/api/gyms');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/gyms/:id/live', () => {
    test('should return live snapshot with all required fields', async () => {
      // occupancy, revenue, events, anomalies, gymInfo — 5 parallel queries
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '47' }] })
        .mockResolvedValueOnce({ rows: [{ total: '35000' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 'g1', name: 'WTF Gyms — Bandra West', city: 'Mumbai', capacity: 300, status: 'active', opens_at: '05:00', closes_at: '23:00' }]
        });

      const res = await request(app).get('/api/gyms/12345678-1234-1234-1234-123456789abc/live');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('current_occupancy');
      expect(res.body).toHaveProperty('today_revenue');
      expect(res.body).toHaveProperty('capacity_pct');
      expect(res.body).toHaveProperty('gym');
      expect(res.body).toHaveProperty('occupancy');
      expect(res.body.occupancy).toHaveProperty('color');
      expect(res.body.occupancy).toHaveProperty('count');
      expect(res.body.occupancy).toHaveProperty('percentage');
    });

    test('should return correct occupancy color — green for <60%', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '30' }] })  // 30/300 = 10%
        .mockResolvedValueOnce({ rows: [{ total: '10000' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 'g1', name: 'Gym', city: 'City', capacity: 300, status: 'active', opens_at: '06:00', closes_at: '22:00' }]
        });

      const res = await request(app).get('/api/gyms/12345678-1234-1234-1234-123456789abc/live');
      expect(res.body.occupancy.color).toBe('green');
    });

    test('should return 400 for invalid gym ID', async () => {
      const res = await request(app).get('/api/gyms/bad/live');
      expect(res.status).toBe(400);
    });

    test('should return 404 for non-existent gym', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }); // no gym found

      const res = await request(app).get('/api/gyms/12345678-1234-1234-1234-123456789abc/live');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/gyms/:id/analytics', () => {
    test('should return analytics with valid dateRange', async () => {
      // heatmap, revenueByPlan, churnRisk, newVsRenewal
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ day_of_week: 1, hour_of_day: 8, checkin_count: 45 }] })
        .mockResolvedValueOnce({ rows: [{ plan_type: 'monthly', total: '25000', count: '10' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ payment_type: 'new', count: '8', total: '12000' }] });

      const res = await request(app).get('/api/gyms/12345678-1234-1234-1234-123456789abc/analytics?dateRange=30d');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('peak_hours_heatmap');
      expect(res.body).toHaveProperty('revenue_by_plan');
      expect(res.body).toHaveProperty('churn_risk_members');
      expect(res.body).toHaveProperty('new_vs_renewal_ratio');
    });

    test('should return 400 for invalid dateRange', async () => {
      const res = await request(app).get('/api/gyms/12345678-1234-1234-1234-123456789abc/analytics?dateRange=999d');
      expect(res.status).toBe(400);
    });

    test('should accept 7d dateRange', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/gyms/12345678-1234-1234-1234-123456789abc/analytics?dateRange=7d');
      expect(res.status).toBe(200);
    });

    test('should accept 90d dateRange', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/gyms/12345678-1234-1234-1234-123456789abc/analytics?dateRange=90d');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/anomalies', () => {
    test('should return empty array when no anomalies', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/anomalies');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('should filter anomalies by severity', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'a1', type: 'capacity_breach', severity: 'critical', gym_name: 'Bandra' }]
      });

      const res = await request(app).get('/api/anomalies?severity=critical');
      expect(res.status).toBe(200);
      expect(res.body[0].severity).toBe('critical');
    });

    test('should accept gym_id query param', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/anomalies?gym_id=12345678-1234-1234-1234-123456789abc');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('should return 400 for invalid severity', async () => {
      const res = await request(app).get('/api/anomalies?severity=invalid');
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/anomalies/:id/dismiss', () => {
    test('should dismiss a warning anomaly', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ severity: 'warning' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'a1', dismissed: true, resolved: true }] });

      const res = await request(app).patch('/api/anomalies/12345678-1234-1234-1234-123456789abc/dismiss');
      expect(res.status).toBe(200);
    });

    test('should return 403 when trying to dismiss critical anomaly', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ severity: 'critical' }] });

      const res = await request(app).patch('/api/anomalies/12345678-1234-1234-1234-123456789abc/dismiss');
      expect(res.status).toBe(403);
    });

    test('should return 404 for non-existent anomaly', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).patch('/api/anomalies/12345678-1234-1234-1234-123456789abc/dismiss');
      expect(res.status).toBe(404);
    });

    test('should return 400 for invalid anomaly ID', async () => {
      const res = await request(app).patch('/api/anomalies/bad/dismiss');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/simulator/start', () => {
    test('should start simulator with valid speed', async () => {
      const res = await request(app).post('/api/simulator/start').send({ speed: 5 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('speed', 5);
    });

    test('should start with speed 1', async () => {
      const res = await request(app).post('/api/simulator/start').send({ speed: 1 });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('running');
      expect(res.body.speed).toBe(1);
    });

    test('should start with speed 10', async () => {
      const res = await request(app).post('/api/simulator/start').send({ speed: 10 });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('running');
      expect(res.body.speed).toBe(10);
    });

    test('should return 400 for invalid speed', async () => {
      const res = await request(app).post('/api/simulator/start').send({ speed: 3 });
      expect(res.status).toBe(400);
    });

    test('should return 400 for speed 99', async () => {
      const res = await request(app).post('/api/simulator/start').send({ speed: 99 });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/simulator/stop', () => {
    test('should stop simulator', async () => {
      const res = await request(app).post('/api/simulator/stop');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('paused');
    });
  });

  describe('POST /api/simulator/reset', () => {
    test('should reset simulator and close all open checkins', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE checkins
      const res = await request(app).post('/api/simulator/reset');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('reset');
    });
  });

  describe('GET /api/analytics/cross-gym', () => {
    test('should return cross-gym revenue comparison', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { gym_id: 'g1', gym_name: 'Bandra West', total_revenue: '450000', rank: '1' },
          { gym_id: 'g2', gym_name: 'Powai', total_revenue: '380000', rank: '2' },
        ]
      });

      const res = await request(app).get('/api/analytics/cross-gym');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('gym_id');
      expect(res.body[0]).toHaveProperty('total_revenue');
      expect(res.body[0]).toHaveProperty('rank');
    });
  });

  describe('GET /api/analytics/activity', () => {
    test('should return recent activity feed', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ event_type: 'checkin', member_name: 'Test User', gym_name: 'Test Gym', timestamp: '2024-01-01T10:00:00Z' }]
      });

      const res = await request(app).get('/api/analytics/activity');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
