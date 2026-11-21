import test from 'node:test';
import assert from 'node:assert/strict';
import { customerOrderShipments } from './customer-order-shipments.ts';

test('returns J&T numbers and fixed courier links for shipped parcels only', () => {
  const shipments = customerOrderShipments([
    { shipped: true, courier: 'J&T', trackingNumber: '632206841562' },
    { shipped: false, courier: 'J&T', trackingNumber: '632206841563' },
    { shipped: true, courier: 'J&T Express', trackingNumber: '632206841562' },
    { shipped: true, courier: 'J&T Express', trackingNumber: '632206841564' },
  ]);
  assert.equal(shipments.length, 2);
  assert.deepEqual(shipments[0], { courier: 'J&T Express', trackingNumber: '632206841562', trackingUrl: 'https://www.jtexpress.my/tracking/632206841562' });
  assert.equal(shipments[1].trackingNumber, '632206841564');
});

test('invalid or missing tracking is omitted and other couriers never use a J&T link', () => {
  assert.deepEqual(customerOrderShipments([
    { shipped: true, courier: 'J&T', trackingNumber: '' },
    { shipped: true, courier: 'J&T', trackingNumber: '<script>' },
    { shipped: true, courier: 'J&T', trackingNumber: { private: 'data' } },
  ]), []);
  assert.deepEqual(customerOrderShipments([{ shipped: true, courier: 'Other courier', trackingNumber: 'AB123456' }]), [{ courier: 'Other courier', trackingNumber: 'AB123456', trackingUrl: '' }]);
});
