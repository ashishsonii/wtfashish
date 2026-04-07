// Unit Tests — Anomaly Detection Logic
// Tests anomaly detection independently of database

const mockPool = {
  query: jest.fn(),
};

jest.mock('../../src/db/pool', () => mockPool);

const anomalyService = require('../../src/services/anomalyService');

describe('AnomalyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Zero Check-in Detection', () => {
    test('should detect gym with zero checkins during operating hours', async () => {
      // First query: find gyms with zero checkins
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 'gym-1', name: 'WTF Gyms — Velachery', opens_at: '06:00', closes_at: '21:00' }]
        })
        // Insert anomaly
        .mockResolvedValueOnce({
          rows: [{ id: 'anom-1', gym_id: 'gym-1', type: 'zero_checkins', severity: 'warning' }]
        })
        // Auto-resolve query
        .mockResolvedValueOnce({ rows: [] });

      const broadcast = jest.fn();
      await anomalyService.detectZeroCheckins(broadcast);

      expect(mockPool.query).toHaveBeenCalledTimes(3);
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ANOMALY_DETECTED',
          anomaly_type: 'zero_checkins',
          severity: 'warning',
        })
      );
    });

    test('should not flag gym with recent checkins', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
      const broadcast = jest.fn();
      await anomalyService.detectZeroCheckins(broadcast);
      expect(broadcast).not.toHaveBeenCalled();
    });

    test('should auto-resolve zero checkin anomaly when checkins resume', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // no new detections
        .mockResolvedValueOnce({ rows: [{ id: 'anom-1', gym_id: 'gym-1' }] }); // resolved

      const broadcast = jest.fn();
      await anomalyService.detectZeroCheckins(broadcast);

      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ANOMALY_RESOLVED', anomaly_id: 'anom-1' })
      );
    });
  });

  describe('Capacity Breach Detection', () => {
    test('should detect capacity breach when occupancy > 90%', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 'gym-bandra', name: 'WTF Gyms — Bandra West', capacity: 300, current_count: 280 }]
        })
        .mockResolvedValueOnce({ rows: [] }) // no existing anomaly
        .mockResolvedValueOnce({
          rows: [{ id: 'anom-2', gym_id: 'gym-bandra', type: 'capacity_breach', severity: 'critical' }]
        })
        .mockResolvedValueOnce({ rows: [] }); // auto-resolve check

      const broadcast = jest.fn();
      await anomalyService.detectCapacityBreach(broadcast);

      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ANOMALY_DETECTED',
          anomaly_type: 'capacity_breach',
          severity: 'critical',
        })
      );
    });

    test('should not flag gym below 90% capacity', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // no gyms above threshold
        .mockResolvedValueOnce({ rows: [] }); // auto-resolve

      const broadcast = jest.fn();
      await anomalyService.detectCapacityBreach(broadcast);
      expect(broadcast).not.toHaveBeenCalled();
    });

    test('should auto-resolve capacity breach when occupancy drops below 85%', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // no new breaches
        .mockResolvedValueOnce({ rows: [{ id: 'anom-2', gym_id: 'gym-bandra' }] }); // resolved

      const broadcast = jest.fn();
      await anomalyService.detectCapacityBreach(broadcast);

      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ANOMALY_RESOLVED' })
      );
    });
  });

  describe('Revenue Drop Detection', () => {
    test('should detect revenue drop > 30% vs same day last week', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 'gym-salt', name: 'WTF Gyms — Salt Lake', today_revenue: 3000, lastweek_revenue: 15000 }]
        })
        .mockResolvedValueOnce({ rows: [] }) // no existing
        .mockResolvedValueOnce({
          rows: [{ id: 'anom-3', gym_id: 'gym-salt', type: 'revenue_drop', severity: 'warning' }]
        })
        .mockResolvedValueOnce({ rows: [] }); // auto-resolve

      const broadcast = jest.fn();
      await anomalyService.detectRevenueDrop(broadcast);

      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ANOMALY_DETECTED',
          anomaly_type: 'revenue_drop',
          severity: 'warning',
        })
      );
    });

    test('should not flag gym with stable revenue', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // no drops
        .mockResolvedValueOnce({ rows: [] }); // auto-resolve

      const broadcast = jest.fn();
      await anomalyService.detectRevenueDrop(broadcast);
      expect(broadcast).not.toHaveBeenCalled();
    });

    test('should auto-resolve revenue drop when revenue recovers', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'anom-3', gym_id: 'gym-salt' }] });

      const broadcast = jest.fn();
      await anomalyService.detectRevenueDrop(broadcast);

      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ANOMALY_RESOLVED' })
      );
    });
  });

  describe('Anomaly Dismiss', () => {
    test('should dismiss a warning-level anomaly', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ severity: 'warning' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'anom-1', dismissed: true, resolved: true }] });

      const result = await anomalyService.dismiss('anom-1');
      expect(result.anomaly).toBeDefined();
      expect(result.anomaly.dismissed).toBe(true);
    });

    test('should reject dismissing a critical anomaly', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ severity: 'critical' }] });

      const result = await anomalyService.dismiss('anom-2');
      expect(result.error).toBe('cannot_dismiss_critical');
    });

    test('should return not_found for non-existent anomaly', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await anomalyService.dismiss('fake-id');
      expect(result.error).toBe('not_found');
    });
  });

  describe('Active Count', () => {
    test('should return count of unresolved anomalies', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '3' }] });

      const count = await anomalyService.getActiveCount();
      expect(count).toBe(3);
    });
  });
});
