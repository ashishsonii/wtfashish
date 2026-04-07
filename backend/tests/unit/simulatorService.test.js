// backend/tests/unit/simulatorService.test.js
const mockPool = {
  query: jest.fn(),
};

jest.mock('../../src/db/pool', () => mockPool);

const simulatorService = require('../../src/services/simulatorService');

describe('SimulatorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    simulatorService.stop(); // default stopped state
  });

  describe('start / stop / reset', () => {
    test('start begins the interval', async () => {
      jest.useFakeTimers();
      const res = await simulatorService.start(5);
      expect(res.status).toBe('running');
      expect(res.speed).toBe(5);
      expect(simulatorService.intervalId).not.toBeNull();
      jest.useRealTimers();
    });

    test('stop clears the interval', () => {
      jest.useFakeTimers();
      simulatorService.start(1);
      const res = simulatorService.stop();
      expect(res.status).toBe('paused');
      expect(simulatorService.intervalId).toBeNull();
      jest.useRealTimers();
    });

    test('reset clears checkouts', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
      const res = await simulatorService.reset();
      expect(res.status).toBe('reset');
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE checkins SET checked_out = NOW()'));
    });
  });

  describe('simulator correctly generates check-in events with realistic time distribution', () => {
    test('generateEvent properly dispatches checkin when few open', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2023-10-10T12:00:00Z')); // hour 12 - daytime

      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '10' }] });

      const simulateCheckinSpy = jest.spyOn(simulatorService, 'simulateCheckin').mockImplementation(() => Promise.resolve());
      
      simulatorService.running = true;
      await simulatorService.generateEvent();
      
      expect(simulateCheckinSpy).toHaveBeenCalled();
      simulateCheckinSpy.mockRestore();
      jest.useRealTimers();
    });

    test('generateEvent dispatches checkout when night time', async () => {
        jest.useFakeTimers();
        // Use hour 2 in LOCAL time (not UTC) — simulatorService uses new Date().getHours() which returns local time
        const nightDate = new Date('2023-10-10T02:00:00');
        jest.setSystemTime(nightDate);

        const simulateCheckoutSpy = jest.spyOn(simulatorService, 'simulateCheckout').mockImplementation(() => Promise.resolve());
        
        simulatorService.running = true;
        await simulatorService.generateEvent();
        
        expect(simulateCheckoutSpy).toHaveBeenCalled();
        simulateCheckoutSpy.mockRestore();
        jest.useRealTimers();
      });

    test('generateEvent dispatches checkout when many open', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2023-10-10T12:00:00Z'));

      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '500' }] }); // > 400

      const simulateCheckoutSpy = jest.spyOn(simulatorService, 'simulateCheckout').mockImplementation(() => Promise.resolve());
      
      simulatorService.running = true;
      await simulatorService.generateEvent();
      
      expect(simulateCheckoutSpy).toHaveBeenCalled();
      simulateCheckoutSpy.mockRestore();
      jest.useRealTimers();
    });
  });

  describe('Event Simulators', () => {
    test('simulateCheckin works', async () => {
      const broadcast = jest.fn();
      simulatorService.setBroadcast(broadcast);

      // member select
      mockPool.query.mockResolvedValueOnce({ rows: [{ member_id: 'm1', name: 'John', gym_id: 'g1', gym_name: 'Gym', capacity: 100 }] });
      // insert checkin
      mockPool.query. mockResolvedValueOnce({ rows: [{ id: 'c1', checked_in: new Date() }] });
      // update members
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
      // get occupancy
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '50' }] });

      await simulatorService.simulateCheckin();

      expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'CHECKIN_EVENT', gym_id: 'g1', current_occupancy: 50 }));
    });

    test('simulateCheckout works', async () => {
      const broadcast = jest.fn();
      simulatorService.setBroadcast(broadcast);

      // select checkin
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'c1', member_id: 'm1', gym_id: 'g1', name: 'John', gym_name: 'Gym', capacity: 100 }] });
      // update checkins
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
      // get occupancy
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '20' }] });

      await simulatorService.simulateCheckout();

      expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'CHECKOUT_EVENT', gym_id: 'g1', current_occupancy: 20 }));
    });

    test('simulatePayment works', async () => {
      const broadcast = jest.fn();
      simulatorService.setBroadcast(broadcast);

      // member select
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'm1', name: 'John', gym_id: 'g1', plan_type: 'monthly', gym_name: 'Gym' }] });
      // insert
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
      // get total
      mockPool.query.mockResolvedValueOnce({ rows: [{ total: '3000' }] });

      await simulatorService.simulatePayment();

      expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'PAYMENT_EVENT', gym_id: 'g1', amount: 1499 }));
    });
  });
});
