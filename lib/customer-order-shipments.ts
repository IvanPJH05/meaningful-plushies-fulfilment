type ShippedOrder = { shipped: boolean; courier?: unknown; trackingNumber?: unknown };

// Only courier references are public. Never include the full order data here.
export function customerOrderShipments(orders: ShippedOrder[]) {
  const seen = new Set<string>();
  return orders.flatMap(order => {
    if (!order.shipped || typeof order.trackingNumber !== 'string') return [];
    const trackingNumber = order.trackingNumber.trim();
    if (!/^[A-Za-z0-9-]{6,40}$/.test(trackingNumber)) return [];
    const courier = typeof order.courier === 'string' ? order.courier.trim().slice(0, 60) : '';
    const key = courier.toLowerCase().replace(/[^a-z0-9]/g, '');
    const jnt = ['jt', 'jnt', 'jtexpress', 'jntexpress'].includes(key);
    const identity = `${jnt ? 'jnt' : key}:${trackingNumber}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [{
      courier: jnt ? 'J&T Express' : courier,
      trackingNumber,
      trackingUrl: jnt ? `https://www.jtexpress.my/tracking/${encodeURIComponent(trackingNumber)}` : '',
    }];
  });
}
