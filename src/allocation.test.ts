import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cancelOrder, confirmAllocationPlan, confirmOrder, createApproval, createCustomsDeclaration, createOrder, decideApproval, getAllocationPlan, getOrder, listOutbox, planAllocation, state, sweepExpiredReservations, timeline, updateCustoms
} from './domain.js';

const lot = (lotId: string) => state.inventory.find(item => item.id === lotId)!;
const activeReservations = (orderId: string) => state.reservations.filter(item => item.orderId === orderId && item.status === 'active');
const assertInventoryInvariant = () => {
  for (const entry of state.inventory) {
    const active = state.reservations.filter(item => item.lotId === entry.id && item.status === 'active').reduce((sum, item) => sum + item.quantity, 0);
    assert.equal(entry.reserved, active, `批次 ${entry.id} 的 reserved 与有效预留之和不一致`);
    assert.ok(entry.available >= entry.reserved, `批次 ${entry.id} 超卖`);
  }
};
const confirmedOrder = (reference: string, quantity: number, origin = '上海保税区', sku = 'SENSOR-X9') => {
  const order = createOrder('tenant-acme', { customerId: 'CUS-001', reference, origin, destination: '鹿特丹', items: [{ sku, description: '测试物料', quantity, unitPrice: 100, weightKg: 1, hsCode: '9025.19' }] });
  confirmOrder('tenant-acme', order.id, 'tester');
  return order;
};

test('候选方案只读计算不修改 reserved，确认后才写入预留并保持审计/时间线/outbox 一致', () => {
  const order = confirmedOrder(`PLAN-${Date.now()}`, 5);
  const before = lot('LOT-001').reserved;
  const plan = planAllocation('tenant-acme', order.id, {}, 'tester');
  assert.equal(plan.status, 'draft');
  assert.equal(plan.feasible, true);
  assert.equal(lot('LOT-001').reserved, before, '候选计算不得提前修改 reserved');
  assert.equal(plan.lines[0].warehouse, 'SHANGHAI-FTZ', '应优先匹配运输起点仓库');
  assert.ok(plan.lines[0].reasons.length > 0, '每一行都要有可解释理由');
  assert.ok(plan.explanation.length > 0);

  const result = confirmAllocationPlan('tenant-acme', plan.id, 'tester');
  assert.equal(result.order.status, 'allocated');
  assert.equal(lot('LOT-001').reserved, before + 5);
  assert.equal(activeReservations(order.id).reduce((sum, item) => sum + item.quantity, 0), 5);

  const again = confirmAllocationPlan('tenant-acme', plan.id, 'tester');
  assert.equal(again.plan.status, 'confirmed', '重复确认应幂等返回');
  assert.equal(lot('LOT-001').reserved, before + 5, '重复确认不得重复预留');

  const events = timeline('tenant-acme', order.id).map(item => item.action);
  for (const action of ['allocation.plan.created', 'allocation.plan.confirmed', 'order.allocated']) assert.ok(events.includes(action), `时间线缺少 ${action}`);
  assert.ok(listOutbox('tenant-acme').some(item => item.topic === 'inventory.reserved' && item.aggregateId === order.id));
  assertInventoryInvariant();
});

test('两个方案竞争同一批库存时后确认者失败且库存不被重复预留', () => {
  const freeBefore = lot('LOT-003').available - lot('LOT-003').reserved;
  const orderA = confirmedOrder(`COMP-A-${Date.now()}`, 8, '鹿特丹');
  const orderB = confirmedOrder(`COMP-B-${Date.now()}`, 8, '鹿特丹');
  const planA = planAllocation('tenant-acme', orderA.id, { preferredWarehouses: ['ROTTERDAM-DC'] }, 'tester');
  const planB = planAllocation('tenant-acme', orderB.id, { preferredWarehouses: ['ROTTERDAM-DC'] }, 'tester');
  assert.deepEqual(planA.lines.map(item => item.lotId), ['LOT-003']);
  assert.deepEqual(planB.lines.map(item => item.lotId), ['LOT-003']);

  confirmAllocationPlan('tenant-acme', planA.id, 'tester');
  assert.equal(lot('LOT-003').reserved, freeBefore === 12 ? 8 : lot('LOT-003').reserved);
  assert.throws(() => confirmAllocationPlan('tenant-acme', planB.id, 'tester'), /库存竞争冲突/);
  assert.equal(getAllocationPlan('tenant-acme', planB.id).status, 'failed');
  assert.equal(lot('LOT-003').reserved, 8, '竞争失败后库存只能被预留一次');
  assert.equal(getOrder('tenant-acme', orderB.id).status, 'confirmed', '竞争失败的订单保持已确认状态可重新规划');

  const retry = planAllocation('tenant-acme', orderB.id, {}, 'tester');
  assert.ok(retry.lines.some(item => item.lotId === 'LOT-001'), '重新规划应回落到其他仓库');
  assertInventoryInvariant();
});

test('部分可分配时按策略进入待补货，补货后二次规划完成整单分配', () => {
  const freeX9 = state.inventory.filter(item => item.sku === 'SENSOR-X9').reduce((sum, item) => sum + item.available - item.reserved, 0);
  const order = confirmedOrder(`PARTIAL-${Date.now()}`, freeX9 + 50);
  const plan = planAllocation('tenant-acme', order.id, { policy: 'partial_backorder' }, 'tester');
  assert.equal(plan.feasible, false);
  assert.deepEqual(plan.backordered, [{ sku: 'SENSOR-X9', quantity: 50 }]);

  const partial = confirmAllocationPlan('tenant-acme', plan.id, 'tester');
  assert.equal(partial.order.status, 'awaiting_stock', '部分可分配时应进入待补货而非整单失败');
  assert.equal(activeReservations(order.id).reduce((sum, item) => sum + item.quantity, 0), freeX9);

  state.inventory.push({ id: 'LOT-NEW', tenantId: 'tenant-acme', warehouse: 'SHANGHAI-FTZ', sku: 'SENSOR-X9', available: 100, reserved: 0, lotCode: 'SX9-2701', expiresAt: '2027-12-31T00:00:00.000Z' });
  const topUp = planAllocation('tenant-acme', order.id, {}, 'tester');
  assert.deepEqual(topUp.lines.map(item => [item.lotId, item.quantity]), [['LOT-NEW', 50]], '二次规划只计算剩余缺口');
  const done = confirmAllocationPlan('tenant-acme', topUp.id, 'tester');
  assert.equal(done.order.status, 'allocated');
  assertInventoryInvariant();
});

test('整单失败策略下库存不足不会写入任何预留', () => {
  const freeX9 = state.inventory.filter(item => item.sku === 'SENSOR-X9').reduce((sum, item) => sum + item.available - item.reserved, 0);
  const order = confirmedOrder(`ALLORNIL-${Date.now()}`, freeX9 + 10);
  const plan = planAllocation('tenant-acme', order.id, { policy: 'all_or_nothing' }, 'tester');
  assert.equal(plan.feasible, false);
  assert.throws(() => confirmAllocationPlan('tenant-acme', plan.id, 'tester'), /整单分配失败/);
  assert.equal(activeReservations(order.id).length, 0);
  assert.equal(getOrder('tenant-acme', order.id).status, 'confirmed');
  assertInventoryInvariant();
});

test('取消、信用审批失败、海关退回、预留过期都会释放正确数量并保持一致性', () => {
  const cancelled = confirmedOrder(`CXL-${Date.now()}`, 3);
  confirmAllocationPlan('tenant-acme', planAllocation('tenant-acme', cancelled.id, {}, 'tester').id, 'tester');
  const reservedLot = lot(activeReservations(cancelled.id)[0].lotId);
  const reservedBeforeCancel = reservedLot.reserved;
  cancelOrder('tenant-acme', cancelled.id, 'tester');
  assert.equal(reservedLot.reserved, reservedBeforeCancel - 3);
  assert.ok(state.reservations.filter(item => item.orderId === cancelled.id).every(item => item.status === 'released' && item.releaseReason === 'order_cancelled'));

  const creditFailed = confirmedOrder(`CRD-${Date.now()}`, 2);
  confirmAllocationPlan('tenant-acme', planAllocation('tenant-acme', creditFailed.id, {}, 'tester').id, 'tester');
  const approval = createApproval('tenant-acme', { orderId: creditFailed.id, type: 'credit_override', reason: '授信复核' }, 'tester');
  decideApproval('tenant-acme', approval.id, { status: 'rejected', comment: '风控不通过' }, 'finance');
  assert.equal(activeReservations(creditFailed.id).length, 0, '信用审批失败必须释放全部预留');
  assert.equal(getOrder('tenant-acme', creditFailed.id).status, 'awaiting_stock');

  const customsFailed = confirmedOrder(`CUS-${Date.now()}`, 2);
  confirmAllocationPlan('tenant-acme', planAllocation('tenant-acme', customsFailed.id, {}, 'tester').id, 'tester');
  const declaration = createCustomsDeclaration('tenant-acme', { orderId: customsFailed.id }, 'tester');
  updateCustoms('tenant-acme', declaration.id, { status: 'rejected', rejectionReason: '单证不符' }, 'tester');
  assert.equal(activeReservations(customsFailed.id).length, 0, '报关未放行必须释放全部预留');
  assert.ok(state.reservations.some(item => item.orderId === customsFailed.id && item.releaseReason === 'customs_rejected'));
  assert.equal(getOrder('tenant-acme', customsFailed.id).status, 'awaiting_stock');

  const expiring = confirmedOrder(`EXP-${Date.now()}`, 2);
  confirmAllocationPlan('tenant-acme', planAllocation('tenant-acme', expiring.id, { reservationTtlMinutes: -1 }, 'tester').id, 'tester');
  assert.equal(activeReservations(expiring.id).length, 1);
  const sweep = sweepExpiredReservations('tenant-acme', 'tester');
  assert.ok(sweep.released.some(item => item.orderId === expiring.id && item.released.reduce((sum, line) => sum + line.quantity, 0) === 2));
  assert.equal(activeReservations(expiring.id).length, 0, '过期预留必须被释放');
  assert.equal(getOrder('tenant-acme', expiring.id).status, 'awaiting_stock');
  assert.ok(listOutbox('tenant-acme').some(item => item.topic === 'inventory.reservation.released' && item.aggregateId === expiring.id));

  const stale = confirmedOrder(`STALE-${Date.now()}`, 1);
  const stalePlan = planAllocation('tenant-acme', stale.id, { planTtlMinutes: -1 }, 'tester');
  assert.throws(() => confirmAllocationPlan('tenant-acme', stalePlan.id, 'tester'), /已过期/);
  assert.equal(getAllocationPlan('tenant-acme', stalePlan.id).status, 'expired');
  assertInventoryInvariant();
});
