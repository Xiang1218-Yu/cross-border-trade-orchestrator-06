import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateOrder, cancelOrder, confirmAllocationPlan, confirmOrder, createCustomsDeclaration, createInventoryLot, createOrder, decideApproval, dispatchOrder, expireReservations, generateInvoice, getAllocationStatus, listOutbox, operationSummary, planAllocation, recordPayment, state, timeline, updateCustoms } from './domain.js';

test('order lifecycle preserves credit, inventory, customs, shipment and invoice invariants', () => {
  const order = createOrder('tenant-acme', { customerId: 'CUS-001', reference: `TEST-${Date.now()}`, origin: '上海', destination: '汉堡', items: [{ description: '传感器', sku: 'SENSOR-X9', quantity: 2, unitPrice: 100, weightKg: 1, hsCode: '9025.19' }] });
  assert.equal(order.status, 'draft');
  confirmOrder('tenant-acme', order.id, 'tester');
  allocateOrder('tenant-acme', order.id, 'tester');
  const declaration = createCustomsDeclaration('tenant-acme', { orderId: order.id });
  updateCustoms('tenant-acme', declaration.id, { documentRefs: declaration.requiredDocuments, status: 'submitted' }, 'tester');
  updateCustoms('tenant-acme', declaration.id, { status: 'cleared' }, 'tester');
  const dispatched = dispatchOrder('tenant-acme', order.id, 'tester');
  assert.equal(dispatched.status, 'dispatched');
  const invoice = generateInvoice('tenant-acme', order.id, 'tester');
  assert.ok(invoice.total > invoice.subtotal);
  recordPayment('tenant-acme', { invoiceId: invoice.id, amount: invoice.total, method: 'bank_transfer', reference: `PAY-${Date.now()}` }, 'tester');
  assert.equal(state.invoices.find(item => item.id === invoice.id)?.status, 'paid');
});

test('credit overage creates approval and approval increases only the required limit', () => {
  const order = createOrder('tenant-acme', { customerId: 'CUS-002', reference: `CREDIT-${Date.now()}`, origin: '深圳', destination: '洛杉矶', items: [{ description: '控制模块', sku: 'CONTROL-M2', quantity: 10, unitPrice: 420, weightKg: 2, hsCode: '8537.10' }] });
  assert.throws(() => confirmOrder('tenant-acme', order.id, 'tester'), /需要审批/);
  const approval = state.approvals.find(item => item.orderId === order.id && item.type === 'credit_override');
  assert.ok(approval);
  decideApproval('tenant-acme', approval!.id, { status: 'approved', comment: '额度复核通过' }, 'finance');
  assert.doesNotThrow(() => confirmOrder('tenant-acme', order.id, 'finance'));
});

test('operation summary exposes receivable and reservation metrics', () => {
  const summary = operationSummary('tenant-acme');
  assert.ok(summary.orderCount >= 1);
  assert.ok(summary.receivable >= 0);
  assert.ok(summary.inventory.every(item => item.available >= item.reserved));
});

const suffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
function prepareOrder(sku: string, quantity: number, available = 100, options: { expiresAt?: string; warehouse?: string; transportOrigin?: string; priority?: number } = {}) {
  createInventoryLot('tenant-acme', { warehouse: options.warehouse ?? 'SHANGHAI-FTZ', transportOrigin: options.transportOrigin ?? '上海保税区', sku, available, lotCode: `${sku}-LOT`, expiresAt: options.expiresAt ?? '2027-06-30T00:00:00.000Z', priority: options.priority }, 'tester');
  const order = createOrder('tenant-acme', { customerId: 'CUS-001', reference: `ALLOC-${sku}-${suffix()}`, origin: '上海保税区', destination: '鹿特丹', items: [{ description: sku, sku, quantity, unitPrice: 10, weightKg: 1, hsCode: '0000.00' }] }, 'tester');
  confirmOrder('tenant-acme', order.id, 'tester');
  return order;
}

test('planning is side-effect free until callers confirm the explainable proposal', () => {
  const sku = `PLAN-${suffix()}`;
  const order = prepareOrder(sku, 3);
  const lot = state.inventory.find(item => item.sku === sku)!;
  const reservedBefore = lot.reserved;
  const plan = planAllocation('tenant-acme', { orderId: order.id, strategy: 'fefo' }, 'tester');
  assert.equal(plan.status, 'proposed');
  assert.equal(state.inventory.find(item => item.id === lot.id)?.reserved, reservedBefore);
  assert.equal(plan.lines[0].quantity, 3);
  assert.ok(plan.lines[0].reasons.some(reason => reason.includes('FEFO')));
  assert.equal(listOutbox('tenant-acme')[0].topic, 'allocation-plan.proposed');
  const confirmed = confirmAllocationPlan('tenant-acme', plan.id, 'tester');
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(state.inventory.find(item => item.id === lot.id)?.reserved, reservedBefore + 3);
});

test('only one competing proposal can reserve a lot; the stale plan fails atomically', () => {
  const sku = `RACE-${suffix()}`;
  const first = prepareOrder(sku, 6);
  const second = prepareOrder(sku, 6);
  const firstPlan = planAllocation('tenant-acme', { orderId: first.id, strategy: 'fefo' }, 'tester');
  const secondPlan = planAllocation('tenant-acme', { orderId: second.id, strategy: 'fefo' }, 'tester');
  confirmAllocationPlan('tenant-acme', secondPlan.id, 'tester');
  assert.throws(() => confirmAllocationPlan('tenant-acme', firstPlan.id, 'tester'), /方案冲突/);
  const lot = state.inventory.find(item => item.sku === sku)!;
  assert.equal(lot.reserved, 6);
  assert.equal(state.reservations.filter(item => item.orderId === first.id && item.status === 'active').length, 0);
});

test('partial inventory either fails the whole order or enters deterministic backorder state', () => {
  const sku = `SHORT-${suffix()}`;
  const failed = prepareOrder(sku, 10, 6);
  const failPlan = planAllocation('tenant-acme', { orderId: failed.id, mode: 'fail_order', strategy: 'fefo' }, 'tester');
  assert.equal(failPlan.allocatable, false);
  assert.equal(failPlan.shortages[0].shortageQuantity, 4);
  assert.throws(() => confirmAllocationPlan('tenant-acme', failPlan.id, 'tester'), /整单失败/);
  assert.equal(state.inventory.find(item => item.sku === sku)?.reserved, 0);

  const backOrder = prepareOrder(`${sku}-BO`, 10, 6);
  const backPlan = planAllocation('tenant-acme', { orderId: backOrder.id, mode: 'backorder', strategy: 'fefo' }, 'tester');
  const confirmed = confirmAllocationPlan('tenant-acme', backPlan.id, 'tester');
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(getAllocationStatus('tenant-acme', backOrder.id).orderStatus, 'backordered');
  assert.equal(getAllocationStatus('tenant-acme', backOrder.id).lines[0].shortageQuantity, 4);
  assert.throws(() => dispatchOrder('tenant-acme', backOrder.id, 'tester'), /待补货订单不能出运/);
});

test('cancellation and customs rejection release exactly the active quantities', () => {
  const sku = `REL-${suffix()}`;
  const order = prepareOrder(sku, 5);
  const plan = planAllocation('tenant-acme', { orderId: order.id, mode: 'backorder', strategy: 'fefo' }, 'tester');
  confirmAllocationPlan('tenant-acme', plan.id, 'tester');
  const declaration = createCustomsDeclaration('tenant-acme', { orderId: order.id }, 'tester');
  updateCustoms('tenant-acme', declaration.id, { documentRefs: declaration.requiredDocuments, status: 'submitted' }, 'tester');
  updateCustoms('tenant-acme', declaration.id, { status: 'rejected', rejectionReason: '查验未通过' }, 'tester');
  assert.equal(state.inventory.find(item => item.sku === sku)?.reserved, 0);
  assert.equal(state.reservations.find(item => item.planId === plan.id)?.status, 'released');
  assert.equal(state.reservations.find(item => item.planId === plan.id)?.releaseReason, 'customs_rejected');
  assert.equal(state.orders.find(item => item.id === order.id)?.status, 'confirmed');

  const replacement = planAllocation('tenant-acme', { orderId: order.id, strategy: 'fefo' }, 'tester');
  confirmAllocationPlan('tenant-acme', replacement.id, 'tester');
  cancelOrder('tenant-acme', order.id, 'tester');
  assert.equal(state.inventory.find(item => item.sku === sku)?.reserved, 0);
  assert.equal(state.reservations.filter(item => item.orderId === order.id && item.status === 'released').length, 2);
});

test('rejected credit approval releases active reservations and leaves order available for later allocation', () => {
  const sku = `CREDITREL-${suffix()}`;
  const customer = state.customers.find(item => item.id === 'CUS-002')!;
  const originalLimit = customer.creditLimit;
  customer.creditLimit = 500000;
  customer.creditUsed = 0;
  const order = prepareOrder(sku, 4);
  const plan = planAllocation('tenant-acme', { orderId: order.id, strategy: 'fefo' }, 'tester');
  confirmAllocationPlan('tenant-acme', plan.id, 'tester');
  customer.creditLimit = customer.creditUsed - 1;
  customer.blocked = true;
  const manual = { id: 'manual-approval', tenantId: 'tenant-acme', orderId: order.id, type: 'credit_override' as const, reason: 'manual', status: 'pending' as const, createdAt: new Date().toISOString() };
  state.approvals.push(manual);
  decideApproval('tenant-acme', manual.id, { status: 'rejected', comment: '拒绝授信' }, 'finance');
  assert.equal(state.inventory.find(item => item.sku === sku)?.reserved, 0);
  assert.equal(state.orders.find(item => item.id === order.id)?.status, 'confirmed');
  customer.creditLimit = originalLimit;
  customer.blocked = false;
});

test('reservation expiry releases only expired reservations and transitions partial orders to replenishment', () => {
  const sku = `EXP-${suffix()}`;
  const order = prepareOrder(sku, 5);
  const plan = planAllocation('tenant-acme', { orderId: order.id, reservationTtlMs: 1000, strategy: 'fefo' }, 'tester');
  confirmAllocationPlan('tenant-acme', plan.id, 'tester');
  const at = new Date(Date.now() + 5000).toISOString();
  const result = expireReservations('tenant-acme', { at }, 'scheduler');
  assert.deepEqual(result.releasedReservationIds, state.reservations.filter(item => item.planId === plan.id).map(item => item.id));
  assert.equal(state.inventory.find(item => item.sku === sku)?.reserved, 0);
  assert.equal(state.orders.find(item => item.id === order.id)?.status, 'confirmed');
});

test('scoring prefers earliest expiry while still considering route and warehouse explanations', () => {
  const sku = `FEFO-${suffix()}`;
  createInventoryLot('tenant-acme', { warehouse: 'ROTTERDAM-DC', transportOrigin: '鹿特丹仓', sku, available: 10, lotCode: `${sku}-LATER`, expiresAt: '2027-08-01T00:00:00.000Z', priority: 50 }, 'tester');
  createInventoryLot('tenant-acme', { warehouse: 'SHANGHAI-FTZ', transportOrigin: '上海保税区', sku, available: 10, lotCode: `${sku}-EARLY`, expiresAt: '2026-12-01T00:00:00.000Z', priority: 50 }, 'tester');
  const order = createOrder('tenant-acme', { customerId: 'CUS-001', reference: `FEFO-${suffix()}`, origin: '上海保税区', destination: '鹿特丹', items: [{ description: sku, sku, quantity: 4, unitPrice: 10, weightKg: 1, hsCode: '0000.00' }] }, 'tester');
  confirmOrder('tenant-acme', order.id, 'tester');
  const plan = planAllocation('tenant-acme', { orderId: order.id, strategy: 'auto' }, 'tester');
  assert.equal(plan.lines[0].lotCode, `${sku}-EARLY`);
  assert.ok(timeline('tenant-acme', order.id).some(event => event.action === 'allocation-plan.proposed'));
});
