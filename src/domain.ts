import { randomUUID } from 'node:crypto';

export type OrderStatus = 'draft' | 'confirmed' | 'allocated' | 'backordered' | 'dispatched' | 'delivered' | 'closed' | 'cancelled';
export type CustomsStatus = 'draft' | 'submitted' | 'inspection' | 'cleared' | 'rejected';
export type InvoiceStatus = 'issued' | 'partially_paid' | 'paid' | 'void';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

type Tenant = { id: string; name: string; creditLimit: number; creditUsed: number; currency: string };
type Customer = { id: string; tenantId: string; name: string; creditLimit: number; creditUsed: number; blocked: boolean };
type OrderItem = { sku: string; description: string; quantity: number; unitPrice: number; weightKg: number; hsCode: string };
export type Order = { id: string; tenantId: string; customerId: string; reference: string; origin: string; destination: string; priority: 'standard' | 'urgent' | 'critical'; status: OrderStatus; items: OrderItem[]; totalWeightKg: number; subtotal: number; totalAmount: number; currency: string; version: number; shipmentId?: string; customsDeclarationId?: string; invoiceId?: string; createdAt: string; updatedAt: string };
export type InventoryLot = { id: string; tenantId: string; warehouse: string; transportOrigin?: string; sku: string; available: number; reserved: number; lotCode: string; expiresAt?: string; priority?: number; version: number };
export type Reservation = { id: string; tenantId: string; orderId: string; planId?: string; lotId: string; sku: string; quantity: number; status: 'active' | 'released' | 'consumed'; expiresAt?: string; releasedAt?: string; consumedAt?: string; releaseReason?: ReleaseReason; createdAt: string };
export type AllocationMode = 'fail_order' | 'backorder';
export type AllocationStrategy = 'auto' | 'fefo' | 'transport_origin' | 'warehouse';
export type AllocationPlanStatus = 'proposed' | 'confirmed' | 'released' | 'consumed' | 'expired' | 'superseded' | 'cancelled';
export type ReleaseReason = 'order_cancelled' | 'credit_approval_rejected' | 'customs_rejected' | 'reservation_expired' | 'plan_cancelled';
export type AllocationScore = { expiry: number; transport: number; warehouse: number; priority: number; total: number };
export type AllocationCandidate = { lotId: string; lotCode: string; warehouse: string; transportOrigin: string; sku: string; expiresAt?: string; available: number; free: number; quantityUsed: number; scores: AllocationScore; reasons: string[] };
export type AllocationDecision = { sku: string; requestedQuantity: number; alreadyReserved: number; unmetQuantity: number; allocatedQuantity: number; candidates: AllocationCandidate[] };
export type AllocationPlanLine = { lotId: string; lotCode: string; warehouse: string; transportOrigin: string; sku: string; quantity: number; availableBefore: number; freeBefore: number; lotVersion: number; reservationId?: string; reasons: string[] };
export type InventoryShortage = { sku: string; requestedQuantity: number; alreadyReserved: number; allocatedQuantity: number; shortageQuantity: number };
export type AllocationPlan = {
  id: string; tenantId: string; orderId: string; status: AllocationPlanStatus; mode: AllocationMode; strategy: AllocationStrategy;
  planTtlMs: number; reservationTtlMs?: number; expiresAt: string; reservationExpiresAt?: string;
  lines: AllocationPlanLine[]; decisions: AllocationDecision[]; shortages: InventoryShortage[];
  allocatable: boolean; fulfillment: 'full' | 'partial' | 'none'; summary: { requestedQuantity: number; alreadyReserved: number; allocatedQuantity: number; shortageQuantity: number };
  version: number; createdAt: string; confirmedAt?: string; releasedAt?: string; releaseReason?: ReleaseReason; consumedAt?: string
};
type ShipmentLeg = { id: string; mode: 'truck' | 'rail' | 'sea' | 'air'; origin: string; destination: string; plannedDeparture: string; plannedArrival: string; actualArrival?: string; status: 'planned' | 'in_transit' | 'arrived' | 'delayed' };
type Shipment = { id: string; tenantId: string; orderId: string; trackingNo: string; legs: ShipmentLeg[]; currentLocation: string; eta: string; status: 'planned' | 'in_transit' | 'delivered' | 'exception'; events: { id: string; code: string; location: string; occurredAt: string; note?: string }[] };
type CustomsDeclaration = { id: string; tenantId: string; orderId: string; country: string; status: CustomsStatus; documentRefs: string[]; requiredDocuments: string[]; riskScore: number; rejectionReason?: string; updatedAt: string };
type InvoiceLine = { code: string; description: string; quantity: number; unitPrice: number; amount: number };
type Invoice = { id: string; tenantId: string; orderId: string; number: string; status: InvoiceStatus; currency: string; lines: InvoiceLine[]; subtotal: number; tax: number; total: number; paid: number; dueDate: string; createdAt: string };
type Payment = { id: string; tenantId: string; invoiceId: string; amount: number; method: 'bank_transfer' | 'card' | 'credit_note'; reference: string; receivedAt: string };
type Approval = { id: string; tenantId: string; orderId: string; type: 'credit_override' | 'customs_exception' | 'delay_compensation'; reason: string; status: ApprovalStatus; decidedBy?: string; comment?: string; createdAt: string; decidedAt?: string };
export type AuditEvent = { id: string; tenantId: string; actor: string; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; at: string };
export type OutboxEvent = { id: string; tenantId: string; topic: string; aggregateId: string; payload: unknown; status: 'pending' | 'published'; attempts: number; createdAt: string };

type WarehouseRoute = { warehouse: string; origins: string[]; destinations: string[] };
type State = { tenants: Tenant[]; customers: Customer[]; orders: Order[]; inventory: InventoryLot[]; allocationPlans: AllocationPlan[]; reservations: Reservation[]; shipments: Shipment[]; customs: CustomsDeclaration[]; invoices: Invoice[]; payments: Payment[]; approvals: Approval[]; audit: AuditEvent[]; outbox: OutboxEvent[] };

const now = () => new Date().toISOString();
const clone = <T>(value: T): T => structuredClone(value);
const id = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
const money = (value: number) => Math.round(value * 100) / 100;
const positiveInteger = (value: unknown, message: string) => { if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || Math.floor(value) !== value) throw new Error(message); return value; };
const freeQuantity = (lot: InventoryLot) => lot.available - lot.reserved;

const warehouseRoutes: WarehouseRoute[] = [
  { warehouse: 'SHANGHAI-FTZ', origins: ['上海保税区', '上海', 'Shanghai FTZ'], destinations: ['鹿特丹', 'Rotterdam', '汉堡', 'Hamburg'] },
  { warehouse: 'ROTTERDAM-DC', origins: ['鹿特丹仓', '鹿特丹', 'Rotterdam'], destinations: ['鹿特丹', 'Rotterdam', '阿姆斯特丹', 'Amsterdam'] }
];
const strategyWeights: Record<AllocationStrategy, { expiry: number; transport: number; warehouse: number; priority: number }> = {
  auto: { expiry: 40, transport: 35, warehouse: 15, priority: 10 },
  fefo: { expiry: 70, transport: 15, warehouse: 8, priority: 7 },
  transport_origin: { expiry: 20, transport: 55, warehouse: 15, priority: 10 },
  warehouse: { expiry: 20, transport: 15, warehouse: 55, priority: 10 }
};

export const state: State = {
  tenants: [{ id: 'tenant-acme', name: 'Acme Global Trading', creditLimit: 250000, creditUsed: 36200, currency: 'USD' }],
  customers: [{ id: 'CUS-001', tenantId: 'tenant-acme', name: 'Northstar Retail GmbH', creditLimit: 100000, creditUsed: 12000, blocked: false }, { id: 'CUS-002', tenantId: 'tenant-acme', name: 'Pacific Parts Inc.', creditLimit: 50000, creditUsed: 49000, blocked: false }],
  orders: [], inventory: [
    { id: 'LOT-001', tenantId: 'tenant-acme', warehouse: 'SHANGHAI-FTZ', transportOrigin: '上海保税区', sku: 'SENSOR-X9', available: 80, reserved: 10, lotCode: 'SX9-2608', expiresAt: '2027-01-31T00:00:00.000Z', priority: 80, version: 1 },
    { id: 'LOT-002', tenantId: 'tenant-acme', warehouse: 'SHANGHAI-FTZ', transportOrigin: '上海保税区', sku: 'CONTROL-M2', available: 36, reserved: 4, lotCode: 'CM2-2607', expiresAt: '2026-12-31T00:00:00.000Z', priority: 70, version: 1 },
    { id: 'LOT-003', tenantId: 'tenant-acme', warehouse: 'ROTTERDAM-DC', transportOrigin: '鹿特丹仓', sku: 'SENSOR-X9', available: 12, reserved: 0, lotCode: 'SX9-2606', expiresAt: '2027-03-31T00:00:00.000Z', priority: 60, version: 1 },
    { id: 'LOT-004', tenantId: 'tenant-acme', warehouse: 'SHANGHAI-FTZ', transportOrigin: '上海保税区', sku: 'SENSOR-X9', available: 5, reserved: 0, lotCode: 'SX9-2606-A', expiresAt: '2026-11-30T00:00:00.000Z', priority: 90, version: 1 }
  ], allocationPlans: [], reservations: [], shipments: [], customs: [], invoices: [], payments: [], approvals: [], audit: [], outbox: []
};

function tenant(tenantId: string) { const value = state.tenants.find(item => item.id === tenantId); if (!value) throw new Error('租户不存在'); return value; }
function assertTenant<T extends { tenantId: string }>(item: T | undefined, tenantId: string, message = '数据不存在') { if (!item) throw new Error(message); if (item.tenantId !== tenantId) throw new Error('无权访问其他租户的数据'); return item; }
function customerFor(tenantId: string, customerId: string) { const customer = state.customers.find(item => item.id === customerId && item.tenantId === tenantId); if (!customer) throw new Error('客户不存在'); return customer; }
function orderFor(tenantId: string, orderId: string) { const order = state.orders.find(item => item.id === orderId); return assertTenant(order, tenantId, '订单不存在'); }
function planFor(tenantId: string, planId: string) { const plan = state.allocationPlans.find(item => item.id === planId); return assertTenant(plan, tenantId, '分配方案不存在'); }
function lotFor(tenantId: string, lotId: string) { const lot = state.inventory.find(item => item.id === lotId); return assertTenant(lot, tenantId, '库存批次不存在'); }
function record(tenantId: string, actor: string, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown) { state.audit.unshift({ id: id('AUD'), tenantId, actor, action, entityType, entityId, before: before === undefined ? undefined : clone(before), after: after === undefined ? undefined : clone(after), at: now() }); }
function emit(tenantId: string, topic: string, aggregateId: string, payload: unknown) { state.outbox.unshift({ id: id('EVT'), tenantId, topic, aggregateId, payload: clone(payload), status: 'pending', attempts: 0, createdAt: now() }); }
function mutate(tenantId: string, actor: string, action: string, type: string, entityId: string, before: unknown, after: unknown, topic: string) { record(tenantId, actor, action, type, entityId, before, after); emit(tenantId, topic, entityId, after); }
function touch(order: Order) { order.version += 1; order.updatedAt = now(); }
function transition(order: Order, next: OrderStatus) { const allowed: Record<OrderStatus, OrderStatus[]> = { draft: ['confirmed', 'cancelled'], confirmed: ['allocated', 'backordered', 'cancelled'], allocated: ['dispatched', 'backordered', 'confirmed', 'cancelled'], backordered: ['allocated', 'backordered', 'confirmed', 'cancelled'], dispatched: ['delivered'], delivered: ['closed'], closed: [], cancelled: [] }; if (!allowed[order.status].includes(next)) throw new Error(`订单不能从 ${order.status} 变更为 ${next}`); order.status = next; touch(order); }
function transitionOrStay(order: Order, next: OrderStatus) { if (order.status !== next) transition(order, next); else touch(order); }

export function listOrders(tenantId: string, filters: { status?: string; customerId?: string; q?: string } = {}) { tenant(tenantId); return state.orders.filter(item => item.tenantId === tenantId && (!filters.status || item.status === filters.status) && (!filters.customerId || item.customerId === filters.customerId) && (!filters.q || `${item.reference} ${item.destination}`.toLowerCase().includes(filters.q.toLowerCase()))).map(clone); }
export function getOrder(tenantId: string, orderId: string) { return clone(orderFor(tenantId, orderId)); }
export function createOrder(tenantId: string, input: Partial<Order>, actor = 'system') {
  tenant(tenantId); if (!input.customerId || !input.reference || !input.origin || !input.destination || !input.items?.length) throw new Error('客户、参考号、起讫地和订单明细均不能为空');
  if (state.orders.some(item => item.tenantId === tenantId && item.reference === input.reference)) throw new Error('客户参考号已存在');
  const items = input.items.map(item => { if (!item.sku || !item.quantity || item.quantity <= 0 || !item.unitPrice || item.unitPrice < 0 || !item.weightKg || item.weightKg <= 0) throw new Error('订单明细数量、价格和重量必须为正数'); return { sku: item.sku, description: item.description ?? item.sku, quantity: item.quantity, unitPrice: item.unitPrice, weightKg: item.weightKg, hsCode: item.hsCode ?? '0000.00' }; });
  const subtotal = money(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)); const order: Order = { id: id('ORD'), tenantId, customerId: input.customerId, reference: input.reference, origin: input.origin, destination: input.destination, priority: input.priority ?? 'standard', status: 'draft', items, totalWeightKg: money(items.reduce((sum, item) => sum + item.quantity * item.weightKg, 0)), subtotal, totalAmount: subtotal, currency: input.currency ?? tenant(tenantId).currency, version: 1, createdAt: now(), updatedAt: now() };
  state.orders.unshift(order); mutate(tenantId, actor, 'order.created', 'order', order.id, undefined, order, 'order.created'); return clone(order);
}
export function confirmOrder(tenantId: string, orderId: string, actor = 'system') { const order = orderFor(tenantId, orderId); const before = clone(order); const customer = customerFor(tenantId, order.customerId); if (customer.blocked) throw new Error('客户已被风控冻结'); if (customer.creditUsed + order.totalAmount > customer.creditLimit) { const approval = createApproval(tenantId, { orderId, type: 'credit_override', reason: '订单金额超过客户授信额度' }, actor); throw new Error(`客户授信不足，需要审批 ${approval.id}`); } transition(order, 'confirmed'); customer.creditUsed = money(customer.creditUsed + order.totalAmount); mutate(tenantId, actor, 'order.confirmed', 'order', order.id, before, order, 'order.confirmed'); return clone(order); }

export function createInventoryLot(tenantId: string, input: { warehouse: string; sku: string; available: number; reserved?: number; lotCode?: string; expiresAt?: string; transportOrigin?: string; priority?: number }, actor = 'system') {
  tenant(tenantId);
  if (!input.warehouse || !input.sku) throw new Error('仓库和 SKU 不能为空');
  if (!Number.isFinite(input.available) || input.available < 0 || Math.floor(input.available) !== input.available) throw new Error('可用库存必须是非负整数');
  const reserved = input.reserved ?? 0;
  if (!Number.isFinite(reserved) || reserved < 0 || Math.floor(reserved) !== reserved || reserved > input.available) throw new Error('预留数量必须是不超过库存的非负整数');
  if (input.priority !== undefined && (input.priority < 0 || input.priority > 100)) throw new Error('库存优先级必须在 0 到 100 之间');
  const route = warehouseRoutes.find(item => item.warehouse === input.warehouse);
  const lot: InventoryLot = { id: id('LOT'), tenantId, warehouse: input.warehouse, transportOrigin: input.transportOrigin ?? route?.origins[0], sku: input.sku, available: input.available, reserved, lotCode: input.lotCode ?? `${input.sku}-${state.inventory.length + 1}`, expiresAt: input.expiresAt, priority: input.priority, version: 1 };
  state.inventory.push(lot); mutate(tenantId, actor, 'inventory-lot.created', 'inventory-lot', lot.id, undefined, lot, 'inventory-lot.created'); return clone(lot);
}

function activeReservedQuantity(tenantId: string, orderId: string, sku: string) {
  return state.reservations.filter(item => item.tenantId === tenantId && item.orderId === orderId && item.sku === sku && item.status === 'active').reduce((sum, item) => sum + item.quantity, 0);
}
function activeReservationsForOrder(tenantId: string, orderId: string) { return state.reservations.filter(item => item.tenantId === tenantId && item.orderId === orderId && item.status === 'active'); }
function routeForLot(lot: InventoryLot) { return warehouseRoutes.find(route => route.warehouse === lot.warehouse); }
function transportOrigin(lot: InventoryLot) { return lot.transportOrigin ?? routeForLot(lot)?.origins[0] ?? lot.warehouse; }
function scoreCandidates(order: Order, lots: InventoryLot[], strategy: AllocationStrategy, preferredWarehouses: string[]): AllocationCandidate[] {
  const weights = strategyWeights[strategy];
  const dated = lots.filter(lot => lot.expiresAt).sort((a, b) => Date.parse(a.expiresAt!) - Date.parse(b.expiresAt!));
  const expiryRank = (lot: InventoryLot) => dated.findIndex(item => item.id === lot.id);
  const priorityMax = Math.max(1, ...lots.map(lot => lot.priority ?? 50));
  return lots.map(lot => {
    const route = routeForLot(lot);
    const origins = new Set([...(route?.origins ?? []), ...(lot.transportOrigin ? [lot.transportOrigin] : [])]);
    const originMatch = origins.has(order.origin);
    const destinationMatch = route?.destinations.includes(order.destination) ?? false;
    const preferenceIndex = preferredWarehouses.findIndex(item => item === lot.warehouse);
    const rank = expiryRank(lot);
    const expiry = rank === -1 ? 0 : weights.expiry * (1 - rank / dated.length);
    const transport = originMatch && destinationMatch ? weights.transport : originMatch ? weights.transport * 0.7 : destinationMatch ? weights.transport * 0.4 : 0;
    const warehouse = preferenceIndex === -1 ? 0 : preferenceIndex === 0 ? weights.warehouse : weights.warehouse * 0.55;
    const priority = weights.priority * ((lot.priority ?? 50) / priorityMax);
    const total = Math.round((expiry + transport + warehouse + priority) * 100) / 100;
    const reasons: string[] = [];
    if (rank === 0) reasons.push('有效期最早，按 FEFO 优先消耗');
    else if (rank > 0) reasons.push(`有效期排序第 ${rank + 1}，作为较早批次的补充`);
    else reasons.push('无有效期，排在有有效期批次之后');
    if (originMatch) reasons.push('运输起点与订单起点匹配');
    if (destinationMatch) reasons.push('仓库路由覆盖目的地');
    if (preferenceIndex === 0) reasons.push('属于调用方首选仓库');
    else if (preferenceIndex > 0) reasons.push('属于调用方备选仓库');
    reasons.push(`库存优先级 ${lot.priority ?? 50}/100`);
    return { lotId: lot.id, lotCode: lot.lotCode, warehouse: lot.warehouse, transportOrigin: transportOrigin(lot), sku: lot.sku, expiresAt: lot.expiresAt, available: lot.available, free: freeQuantity(lot), quantityUsed: 0, scores: { expiry: Math.round(expiry * 100) / 100, transport: Math.round(transport * 100) / 100, warehouse: Math.round(warehouse * 100) / 100, priority: Math.round(priority * 100) / 100, total }, reasons };
  }).sort((a, b) => b.scores.total - a.scores.total || Date.parse(a.expiresAt ?? '9999-12-31') - Date.parse(b.expiresAt ?? '9999-12-31') || a.warehouse.localeCompare(b.warehouse) || a.lotId.localeCompare(b.lotId));
}
function buildDecision(order: Order, item: OrderItem, strategy: AllocationStrategy, preferredWarehouses: string[], at: string): AllocationDecision {
  const alreadyReserved = activeReservedQuantity(order.tenantId, order.id, item.sku);
  const unmetQuantity = Math.max(0, item.quantity - alreadyReserved);
  const lots = state.inventory.filter(lot => lot.tenantId === order.tenantId && lot.sku === item.sku && freeQuantity(lot) > 0 && (!lot.expiresAt || Date.parse(lot.expiresAt) > Date.parse(at)));
  const candidates = scoreCandidates(order, lots, strategy, preferredWarehouses);
  let remaining = unmetQuantity;
  for (const candidate of candidates) {
    candidate.quantityUsed = Math.min(remaining, candidate.free);
    remaining -= candidate.quantityUsed;
    if (candidate.quantityUsed > 0) candidate.reasons.unshift(`本批次承担 ${candidate.quantityUsed}/${item.quantity}`);
  }
  return { sku: item.sku, requestedQuantity: item.quantity, alreadyReserved, unmetQuantity, allocatedQuantity: unmetQuantity - remaining, candidates };
}

export function planAllocation(tenantId: string, input: { orderId: string; mode?: AllocationMode; strategy?: AllocationStrategy; preferredWarehouses?: string[]; planTtlMs?: number; reservationTtlMs?: number }, actor = 'system') {
  tenant(tenantId);
  const order = orderFor(tenantId, input.orderId);
  if (!['confirmed', 'backordered'].includes(order.status)) throw new Error('只有已确认或待补货订单可以生成库存分配方案');
  const mode = input.mode ?? 'fail_order';
  if (!['fail_order', 'backorder'].includes(mode)) throw new Error('缺货策略必须是 fail_order 或 backorder');
  const strategy = input.strategy ?? 'auto';
  if (!strategyWeights[strategy]) throw new Error('不支持的分配策略');
  const planTtlMs = input.planTtlMs ?? 15 * 60 * 1000;
  const reservationTtlMs = input.reservationTtlMs === undefined ? 72 * 60 * 60 * 1000 : input.reservationTtlMs;
  positiveInteger(planTtlMs, '方案有效期必须是正整数毫秒');
  if (reservationTtlMs !== undefined) positiveInteger(reservationTtlMs, '预留有效期必须是正整数毫秒');
  const preferredWarehouses = input.preferredWarehouses ?? [];
  const createdAt = now();
  for (const existing of state.allocationPlans.filter(item => item.tenantId === tenantId && item.orderId === order.id && item.status === 'proposed')) {
    const before = clone(existing);
    existing.status = Date.parse(existing.expiresAt) <= Date.parse(createdAt) ? 'expired' : 'superseded';
    existing.version += 1;
    mutate(tenantId, actor, existing.status === 'expired' ? 'allocation-plan.expired' : 'allocation-plan.superseded', 'allocation-plan', existing.id, before, existing, 'allocation-plan.lifecycle');
  }
  const decisions = order.items.map(item => buildDecision(order, item, strategy, preferredWarehouses, createdAt));
  const lines: AllocationPlanLine[] = decisions.flatMap(decision => decision.candidates.filter(candidate => candidate.quantityUsed > 0).map(candidate => ({ lotId: candidate.lotId, lotCode: candidate.lotCode, warehouse: candidate.warehouse, transportOrigin: candidate.transportOrigin, sku: candidate.sku, quantity: candidate.quantityUsed, availableBefore: candidate.available, freeBefore: candidate.free, lotVersion: lotFor(tenantId, candidate.lotId).version, reasons: candidate.reasons })));
  const shortages: InventoryShortage[] = decisions.filter(decision => decision.requestedQuantity > decision.alreadyReserved + decision.allocatedQuantity).map(decision => ({ sku: decision.sku, requestedQuantity: decision.requestedQuantity, alreadyReserved: decision.alreadyReserved, allocatedQuantity: decision.allocatedQuantity, shortageQuantity: decision.requestedQuantity - decision.alreadyReserved - decision.allocatedQuantity }));
  const summary = {
    requestedQuantity: decisions.reduce((sum, item) => sum + item.requestedQuantity, 0),
    alreadyReserved: decisions.reduce((sum, item) => sum + item.alreadyReserved, 0),
    allocatedQuantity: decisions.reduce((sum, item) => sum + item.allocatedQuantity, 0),
    shortageQuantity: shortages.reduce((sum, item) => sum + item.shortageQuantity, 0)
  };
  const fulfillment: AllocationPlan['fulfillment'] = summary.shortageQuantity === 0 ? 'full' : summary.alreadyReserved + summary.allocatedQuantity === 0 ? 'none' : 'partial';
  const plan: AllocationPlan = { id: id('ALP'), tenantId, orderId: order.id, status: 'proposed', mode, strategy, planTtlMs, reservationTtlMs, expiresAt: new Date(Date.parse(createdAt) + planTtlMs).toISOString(), lines, decisions, shortages, allocatable: mode === 'backorder' || shortages.length === 0, fulfillment, summary, version: 1, createdAt };
  state.allocationPlans.unshift(plan);
  mutate(tenantId, actor, 'allocation-plan.proposed', 'allocation-plan', plan.id, undefined, plan, 'allocation-plan.proposed');
  return clone(plan);
}

export function confirmAllocationPlan(tenantId: string, planId: string, actor = 'system') {
  const plan = planFor(tenantId, planId);
  if (plan.status === 'confirmed') return clone(plan);
  if (plan.status === 'expired' || Date.parse(plan.expiresAt) <= Date.now()) {
    const before = clone(plan); plan.status = 'expired'; plan.version += 1;
    mutate(tenantId, actor, 'allocation-plan.expired', 'allocation-plan', plan.id, before, plan, 'allocation-plan.lifecycle');
    throw new Error('分配方案已过期，请重新计算');
  }
  if (plan.status !== 'proposed') throw new Error(`当前方案状态 ${plan.status} 不能确认`);
  if (!plan.allocatable) throw new Error(`整单失败策略下仍缺 ${plan.summary.shortageQuantity} 件，不能确认；请改用待补货方案或调整订单`);
  const order = orderFor(tenantId, plan.orderId);
  if (!['confirmed', 'backordered'].includes(order.status)) throw new Error(`订单当前状态 ${order.status} 不能确认预留`);

  for (const decision of plan.decisions) {
    const currentReserved = activeReservedQuantity(tenantId, order.id, decision.sku);
    if (currentReserved !== decision.alreadyReserved) throw new Error(`库存方案已过期：${decision.sku} 已被其他方案或订单占用或释放，请重新计算`);
  }
  const lotGroups = new Map(plan.lines.map(line => [line.lotId, 0]));
  plan.lines.forEach(line => lotGroups.set(line.lotId, (lotGroups.get(line.lotId) ?? 0) + line.quantity));
  for (const [lotId, quantity] of lotGroups) {
    const lot = lotFor(tenantId, lotId);
    if (lot.version !== plan.lines.find(line => line.lotId === lotId)!.lotVersion) throw new Error(`库存批次 ${lot.lotCode} 已发生变化，方案冲突`);
    if (freeQuantity(lot) < quantity) throw new Error(`库存批次 ${lot.lotCode} 可用量不足，存在并发竞争`);
    if (lot.expiresAt && Date.parse(lot.expiresAt) <= Date.now()) throw new Error(`库存批次 ${lot.lotCode} 已过期`);
  }

  const before = { plan: clone(plan), order: clone(order), lots: plan.lines.map(line => clone(lotFor(tenantId, line.lotId))), reservations: state.reservations.filter(item => item.orderId === order.id).map(clone) };
  const confirmedAt = now();
  const reservationExpiresAt = plan.reservationTtlMs === undefined ? undefined : new Date(Date.parse(confirmedAt) + plan.reservationTtlMs).toISOString();
  for (const line of plan.lines) {
    const lot = lotFor(tenantId, line.lotId);
    lot.reserved += line.quantity; lot.version += 1;
    const reservation: Reservation = { id: id('RSV'), tenantId, orderId: order.id, planId: plan.id, lotId: lot.id, sku: line.sku, quantity: line.quantity, status: 'active', expiresAt: reservationExpiresAt, createdAt: confirmedAt };
    state.reservations.push(reservation);
    line.reservationId = reservation.id;
  }
  plan.status = 'confirmed'; plan.confirmedAt = confirmedAt; plan.reservationExpiresAt = reservationExpiresAt; plan.version += 1;
  transitionOrStay(order, plan.shortages.length ? 'backordered' : 'allocated');
  const after = { plan: clone(plan), order: clone(order), lots: plan.lines.map(line => clone(lotFor(tenantId, line.lotId))), reservations: state.reservations.filter(item => item.orderId === order.id).map(clone) };
  record(tenantId, actor, 'allocation-plan.confirmed', 'allocation-plan', plan.id, before, after);
  emit(tenantId, 'inventory.reserved', plan.id, after);
  return clone(plan);
}

export function allocateOrder(tenantId: string, orderId: string, actor = 'system') {
  const plan = planAllocation(tenantId, { orderId, mode: 'fail_order', strategy: 'fefo', reservationTtlMs: undefined }, actor);
  confirmAllocationPlan(tenantId, plan.id, actor);
  return getOrder(tenantId, orderId);
}

export function cancelAllocationPlan(tenantId: string, planId: string, actor = 'system') {
  const plan = planFor(tenantId, planId);
  if (plan.status !== 'proposed') throw new Error(`只有待确认方案可以取消，当前状态为 ${plan.status}`);
  if (Date.parse(plan.expiresAt) <= Date.now()) { const before = clone(plan); plan.status = 'expired'; plan.version += 1; mutate(tenantId, actor, 'allocation-plan.expired', 'allocation-plan', plan.id, before, plan, 'allocation-plan.lifecycle'); throw new Error('分配方案已过期'); }
  const before = clone(plan); plan.status = 'cancelled'; plan.releasedAt = now(); plan.releaseReason = 'plan_cancelled'; plan.version += 1;
  mutate(tenantId, actor, 'allocation-plan.cancelled', 'allocation-plan', plan.id, before, plan, 'allocation-plan.lifecycle'); return clone(plan);
}
export function listAllocationPlans(tenantId: string, orderId?: string) { tenant(tenantId); return state.allocationPlans.filter(plan => plan.tenantId === tenantId && (!orderId || plan.orderId === orderId)).map(clone); }
export function getAllocationPlan(tenantId: string, planId: string) { return clone(planFor(tenantId, planId)); }
export function getAllocationStatus(tenantId: string, orderId: string) {
  const order = orderFor(tenantId, orderId);
  const active = activeReservationsForOrder(tenantId, orderId);
  const lines = order.items.map(item => { const reserved = active.filter(item2 => item2.sku === item.sku).reduce((sum, item2) => sum + item2.quantity, 0); return { sku: item.sku, requestedQuantity: item.quantity, reservedQuantity: reserved, shortageQuantity: Math.max(0, item.quantity - reserved), fullyReserved: reserved >= item.quantity }; });
  return { orderId: order.id, orderStatus: order.status, lines, plans: state.allocationPlans.filter(plan => plan.tenantId === tenantId && plan.orderId === orderId).map(plan => ({ id: plan.id, status: plan.status, mode: plan.mode, fulfillment: plan.fulfillment, createdAt: plan.createdAt, confirmedAt: plan.confirmedAt, expiresAt: plan.expiresAt, reservationExpiresAt: plan.reservationExpiresAt })) };
}

function releaseOrderReservations(tenantId: string, orderId: string, reason: ReleaseReason, actor: string, reservationIds?: Set<string>, onlyExpiredAt?: string): Reservation[] {
  const order = orderFor(tenantId, orderId);
  const matching = state.reservations.filter(item => item.tenantId === tenantId && item.orderId === orderId && item.status === 'active' && (!reservationIds || reservationIds.has(item.id)) && (!onlyExpiredAt || (item.expiresAt !== undefined && Date.parse(item.expiresAt) <= Date.parse(onlyExpiredAt))));
  if (!matching.length) return [];
  for (const reservation of matching) {
    const lot = lotFor(tenantId, reservation.lotId);
    if (lot.reserved < reservation.quantity) throw new Error(`批次 ${lot.lotCode} 预留账实不一致，拒绝释放`);
  }
  const before = { order: clone(order), reservations: matching.map(clone), lots: [...new Set(matching.map(item => item.lotId))].map(lotId => clone(lotFor(tenantId, lotId))), plans: state.allocationPlans.filter(plan => plan.tenantId === tenantId && plan.orderId === orderId).map(clone) };
  const releasedAt = onlyExpiredAt ?? now();
  for (const reservation of matching) {
    const lot = lotFor(tenantId, reservation.lotId);
    lot.reserved -= reservation.quantity; lot.version += 1;
    reservation.status = 'released'; reservation.releasedAt = releasedAt; reservation.releaseReason = reason;
  }
  for (const planId of new Set(matching.map(item => item.planId).filter((item): item is string => Boolean(item)))) {
    const plan = planFor(tenantId, planId);
    const stillActive = state.reservations.some(item => item.planId === plan.id && item.status === 'active');
    if (!stillActive && plan.status === 'confirmed') { plan.status = 'released'; plan.releasedAt = releasedAt; plan.releaseReason = reason; plan.version += 1; }
  }
  const after = { order: clone(order), reservations: matching.map(clone), lots: [...new Set(matching.map(item => item.lotId))].map(lotId => clone(lotFor(tenantId, lotId))), plans: state.allocationPlans.filter(plan => plan.tenantId === tenantId && plan.orderId === orderId).map(clone) };
  record(tenantId, actor, 'inventory.released', 'order', orderId, before, after);
  emit(tenantId, 'inventory.released', orderId, { reason, releasedAt, released: after.reservations, lots: after.lots, plans: after.plans, order: after.order });
  return matching;
}
function cancelProposedPlans(tenantId: string, orderId: string, actor: string) {
  const at = now();
  for (const plan of state.allocationPlans.filter(item => item.tenantId === tenantId && item.orderId === orderId && item.status === 'proposed')) {
    const before = clone(plan);
    plan.status = Date.parse(plan.expiresAt) <= Date.parse(at) ? 'expired' : 'cancelled'; plan.releasedAt = at; plan.releaseReason = 'plan_cancelled'; plan.version += 1;
    mutate(tenantId, actor, plan.status === 'expired' ? 'allocation-plan.expired' : 'allocation-plan.cancelled', 'allocation-plan', plan.id, before, plan, 'allocation-plan.lifecycle');
  }
}

export function expireAllocationPlans(tenantId: string, input: { at?: string } = {}, actor = 'system') {
  tenant(tenantId); const at = input.at ?? now(); const expired: AllocationPlan[] = [];
  for (const plan of state.allocationPlans.filter(item => item.tenantId === tenantId && item.status === 'proposed' && Date.parse(item.expiresAt) <= Date.parse(at))) {
    const before = clone(plan); plan.status = 'expired'; plan.version += 1; expired.push(clone(plan));
    mutate(tenantId, actor, 'allocation-plan.expired', 'allocation-plan', plan.id, before, plan, 'allocation-plan.lifecycle');
  }
  return expired;
}
export function expireReservations(tenantId: string, input: { at?: string } = {}, actor = 'system') {
  tenant(tenantId); const at = input.at ?? now();
  const expiredReservations = state.reservations.filter(item => item.tenantId === tenantId && item.status === 'active' && item.expiresAt !== undefined && Date.parse(item.expiresAt) <= Date.parse(at));
  const expiredIds = expiredReservations.map(item => item.id);
  const orderIds = [...new Set(expiredReservations.map(item => item.orderId))];
  const releasedByOrder: Record<string, Reservation[]> = {};
  for (const orderId of orderIds) {
    const orderBefore = orderFor(tenantId, orderId);
    const beforeOrder = clone(orderBefore);
    const released = releaseOrderReservations(tenantId, orderId, 'reservation_expired', actor, new Set(expiredIds), at);
    releasedByOrder[orderId] = released.map(clone);
    const order = orderFor(tenantId, orderId);
    if (['allocated', 'backordered'].includes(order.status)) {
      const active = activeReservationsForOrder(tenantId, orderId);
      const covered = order.items.every(item => active.filter(item2 => item2.sku === item.sku).reduce((sum, item2) => sum + item2.quantity, 0) >= item.quantity);
      const target: OrderStatus = covered ? 'allocated' : active.length ? 'backordered' : 'confirmed';
      if (target !== order.status) { transition(order, target); mutate(tenantId, actor, 'order.allocation-expired', 'order', orderId, beforeOrder, order, 'order.allocation-expired'); }
    }
  }
  return { at, releasedReservationIds: expiredIds, releasedByOrder };
}
export function expireAllocations(tenantId: string, input: { at?: string } = {}, actor = 'system') {
  const plans = expireAllocationPlans(tenantId, input, actor);
  const reservations = expireReservations(tenantId, input, actor);
  return { expiredPlans: plans, ...reservations };
}

export function dispatchOrder(tenantId: string, orderId: string, actor = 'system') { const order = orderFor(tenantId, orderId); const reservations = state.reservations.filter(item => item.orderId === orderId && item.status === 'active'); if (!reservations.length) throw new Error('订单没有有效库存分配'); for (const item of order.items) { const reserved = reservations.filter(value => value.sku === item.sku).reduce((sum, value) => sum + value.quantity, 0); if (reserved < item.quantity) throw new Error(`SKU ${item.sku} 仍缺 ${item.quantity - reserved} 件，待补货订单不能出运`); } for (const reservation of reservations) { if (reservation.expiresAt && Date.parse(reservation.expiresAt) <= Date.now()) throw new Error('存在已过期预留，请先执行过期释放并重新补货'); } for (const lotId of new Set(reservations.map(item => item.lotId))) { const quantity = reservations.filter(item => item.lotId === lotId).reduce((sum, item) => sum + item.quantity, 0); const lot = lotFor(tenantId, lotId); if (lot.reserved < quantity || lot.available < quantity) throw new Error(`批次 ${lot.lotCode} 库存账实不一致，拒绝出运消耗`); } const customs = state.customs.find(item => item.orderId === orderId); if (!customs || customs.status !== 'cleared') throw new Error('海关申报尚未放行'); const before = clone(order); transition(order, 'dispatched'); const consumedAt = now(); reservations.forEach(reservation => { const lot = state.inventory.find(item => item.id === reservation.lotId)!; lot.available -= reservation.quantity; lot.reserved -= reservation.quantity; lot.version += 1; reservation.status = 'consumed'; reservation.consumedAt = consumedAt; }); for (const plan of state.allocationPlans.filter(item => item.tenantId === tenantId && item.orderId === orderId && item.status === 'confirmed')) { if (state.reservations.filter(item => item.planId === plan.id).every(item => item.status === 'consumed')) { plan.status = 'consumed'; plan.consumedAt = consumedAt; plan.version += 1; } } const shipment: Shipment = { id: id('SHP'), tenantId, orderId, trackingNo: `CBF${Date.now().toString().slice(-8)}`, legs: [{ id: id('LEG'), mode: 'truck', origin: order.origin, destination: '出口口岸', plannedDeparture: now(), plannedArrival: new Date(Date.now() + 86400000).toISOString(), status: 'planned' }, { id: id('LEG'), mode: 'sea', origin: '出口口岸', destination: order.destination, plannedDeparture: new Date(Date.now() + 172800000).toISOString(), plannedArrival: new Date(Date.now() + 10 * 86400000).toISOString(), status: 'planned' }], currentLocation: order.origin, eta: new Date(Date.now() + 10 * 86400000).toISOString(), status: 'planned', events: [] }; state.shipments.push(shipment); order.shipmentId = shipment.id; record(tenantId, actor, 'order.dispatched', 'order', order.id, before, { order, shipment, reservations, plans: state.allocationPlans.filter(item => item.orderId === orderId) }); emit(tenantId, 'shipment.created', shipment.id, shipment); emit(tenantId, 'inventory.consumed', orderId, { order, reservations, plans: state.allocationPlans.filter(item => item.orderId === orderId) }); return clone(order); }
export function deliverOrder(tenantId: string, orderId: string, actor = 'system') { const order = orderFor(tenantId, orderId); const shipment = state.shipments.find(item => item.orderId === orderId); if (!shipment) throw new Error('运输单不存在'); const before = clone(order); transition(order, 'delivered'); shipment.status = 'delivered'; shipment.currentLocation = order.destination; shipment.events.push({ id: id('TRK'), code: 'DELIVERED', location: order.destination, occurredAt: now(), note: '签收完成' }); mutate(tenantId, actor, 'order.delivered', 'order', order.id, before, { order, shipment }, 'shipment.delivered'); return clone(order); }
export function closeOrder(tenantId: string, orderId: string, actor = 'system') { const order = orderFor(tenantId, orderId); const invoice = state.invoices.find(item => item.orderId === orderId); if (!invoice || invoice.status !== 'paid') throw new Error('发票未完成收款核销'); const before = clone(order); transition(order, 'closed'); const customer = customerFor(tenantId, order.customerId); customer.creditUsed = money(Math.max(0, customer.creditUsed - order.totalAmount)); mutate(tenantId, actor, 'order.closed', 'order', order.id, before, order, 'order.closed'); return clone(order); }
export function cancelOrder(tenantId: string, orderId: string, actor = 'system') { const order = orderFor(tenantId, orderId); const before = clone(order); if (['dispatched', 'delivered', 'closed'].includes(order.status)) throw new Error('已出运订单不能取消'); const activeReservations = activeReservationsForOrder(tenantId, orderId); for (const reservation of activeReservations) { const lot = lotFor(tenantId, reservation.lotId); if (lot.reserved < reservation.quantity) throw new Error(`批次 ${lot.lotCode} 预留账实不一致，拒绝取消`); } cancelProposedPlans(tenantId, orderId, actor); releaseOrderReservations(tenantId, orderId, 'order_cancelled', actor); transition(order, 'cancelled'); const customer = customerFor(tenantId, order.customerId); if (before.status !== 'draft') customer.creditUsed = money(Math.max(0, customer.creditUsed - order.totalAmount)); mutate(tenantId, actor, 'order.cancelled', 'order', order.id, before, { order, reservations: state.reservations.filter(item => item.orderId === orderId), plans: state.allocationPlans.filter(item => item.orderId === orderId) }, 'order.cancelled'); return clone(order); }

export function createCustomsDeclaration(tenantId: string, input: { orderId: string; country?: string; requiredDocuments?: string[] }, actor = 'system') { const order = orderFor(tenantId, input.orderId); if (state.customs.some(item => item.orderId === order.id)) throw new Error('订单已有海关申报'); const declaration: CustomsDeclaration = { id: id('CUS'), tenantId, orderId: order.id, country: input.country ?? order.destination, status: 'draft', documentRefs: [], requiredDocuments: input.requiredDocuments ?? ['commercial-invoice', 'packing-list', 'origin-certificate'], riskScore: order.priority === 'critical' ? 82 : order.totalWeightKg > 1000 ? 60 : 24, updatedAt: now() }; state.customs.push(declaration); order.customsDeclarationId = declaration.id; mutate(tenantId, actor, 'customs.created', 'customs', declaration.id, undefined, declaration, 'customs.created'); return clone(declaration); }
export function updateCustoms(tenantId: string, declarationId: string, input: { status?: CustomsStatus; documentRefs?: string[]; rejectionReason?: string }, actor = 'system') { const declaration = assertTenant(state.customs.find(item => item.id === declarationId), tenantId, '海关申报不存在'); const before = clone(declaration); if (input.documentRefs) declaration.documentRefs = [...new Set(input.documentRefs)]; if (input.status) { if (input.status === 'cleared' && declaration.requiredDocuments.some(doc => !declaration.documentRefs.includes(doc))) throw new Error('放行前必须补齐所有必需单证'); if (input.status === 'inspection' && declaration.status !== 'submitted') throw new Error('只有已提交申报才能进入查验'); if (input.status === 'rejected') { const order = orderFor(tenantId, declaration.orderId); if (['dispatched', 'delivered', 'closed'].includes(order.status)) throw new Error('已出运货物不能按报关拒收直接释放库存，应走退运或异常理赔流程'); const activeReservations = activeReservationsForOrder(tenantId, order.id); for (const reservation of activeReservations) { const lot = lotFor(tenantId, reservation.lotId); if (lot.reserved < reservation.quantity) throw new Error(`批次 ${lot.lotCode} 预留账实不一致，拒绝报关拒收释放`); } declaration.status = input.status; declaration.rejectionReason = input.rejectionReason ?? declaration.rejectionReason ?? '报关未放行'; declaration.updatedAt = now(); const released = releaseOrderReservations(tenantId, order.id, 'customs_rejected', actor); if (['allocated', 'backordered'].includes(order.status) && released.length) transition(order, 'confirmed'); mutate(tenantId, actor, 'customs.updated', 'customs', declaration.id, before, { declaration, order: orderFor(tenantId, order.id), releasedReservations: released }, 'customs.updated'); return clone(declaration); } declaration.status = input.status; } declaration.rejectionReason = input.rejectionReason; declaration.updatedAt = now(); mutate(tenantId, actor, 'customs.updated', 'customs', declaration.id, before, declaration, 'customs.updated'); return clone(declaration); }
export function addShipmentEvent(tenantId: string, shipmentId: string, input: { code: string; location: string; occurredAt?: string; note?: string }, actor = 'system') { const shipment = assertTenant(state.shipments.find(item => item.id === shipmentId), tenantId, '运输单不存在'); if (!input.code || !input.location) throw new Error('轨迹编码和位置不能为空'); const event = { id: id('TRK'), code: input.code, location: input.location, occurredAt: input.occurredAt ?? now(), note: input.note }; shipment.events.push(event); shipment.currentLocation = input.location; if (input.code === 'DEPARTED') { shipment.status = 'in_transit'; shipment.legs[0].status = 'in_transit'; } if (input.code === 'DELAYED') { shipment.status = 'exception'; shipment.legs.find(leg => leg.status !== 'arrived')!.status = 'delayed'; createApproval(tenantId, { orderId: shipment.orderId, type: 'delay_compensation', reason: `运输轨迹 ${shipment.trackingNo} 发生延误` }, actor); } if (input.code === 'ARRIVED') shipment.legs[shipment.legs.length - 1].status = 'arrived'; record(tenantId, actor, 'shipment.event.added', 'shipment', shipment.id, undefined, event); emit(tenantId, 'shipment.event.added', shipment.id, event); return clone(shipment); }

export function generateInvoice(tenantId: string, orderId: string, actor = 'system') { const order = orderFor(tenantId, orderId); const existing = state.invoices.find(item => item.orderId === orderId); if (existing) return clone(existing); if (!['allocated', 'backordered', 'dispatched', 'delivered', 'closed'].includes(order.status)) throw new Error('订单完成库存分配后才能开票'); const freight = money(Math.max(120, order.totalWeightKg * (order.priority === 'critical' ? 4.2 : 2.1))); const fuel = money(freight * 0.13); const customsFee = money(95 + order.items.length * 25); const lines: InvoiceLine[] = [{ code: 'GOODS', description: '货物服务费', quantity: 1, unitPrice: order.subtotal, amount: order.subtotal }, { code: 'FREIGHT', description: '跨境运输费', quantity: 1, unitPrice: freight, amount: freight }, { code: 'FUEL', description: '燃油附加费', quantity: 1, unitPrice: fuel, amount: fuel }, { code: 'CUSTOMS', description: '关务服务费', quantity: 1, unitPrice: customsFee, amount: customsFee }]; const subtotal = money(lines.reduce((sum, line) => sum + line.amount, 0)); const tax = money(subtotal * 0.06); const invoice: Invoice = { id: id('INV'), tenantId, orderId, number: `INV-${new Date().getFullYear()}-${String(state.invoices.length + 1).padStart(5, '0')}`, status: 'issued', currency: order.currency, lines, subtotal, tax, total: money(subtotal + tax), paid: 0, dueDate: new Date(Date.now() + 30 * 86400000).toISOString(), createdAt: now() }; state.invoices.push(invoice); order.invoiceId = invoice.id; mutate(tenantId, actor, 'invoice.issued', 'invoice', invoice.id, undefined, invoice, 'invoice.issued'); return clone(invoice); }
export function recordPayment(tenantId: string, input: { invoiceId: string; amount: number; method: Payment['method']; reference: string }, actor = 'system') { const invoice = assertTenant(state.invoices.find(item => item.id === input.invoiceId), tenantId, '发票不存在'); if (!input.amount || input.amount <= 0 || input.amount > invoice.total - invoice.paid + 0.01) throw new Error('收款金额超过发票未核销余额'); if (state.payments.some(item => item.tenantId === tenantId && item.reference === input.reference)) throw new Error('收款流水号已处理，禁止重复入账'); const before = clone(invoice); const payment: Payment = { id: id('PAY'), tenantId, invoiceId: invoice.id, amount: money(input.amount), method: input.method, reference: input.reference, receivedAt: now() }; state.payments.push(payment); invoice.paid = money(invoice.paid + payment.amount); invoice.status = invoice.paid >= invoice.total - 0.01 ? 'paid' : 'partially_paid'; mutate(tenantId, actor, 'payment.recorded', 'invoice', invoice.id, before, invoice, 'payment.recorded'); return clone(payment); }

export function createApproval(tenantId: string, input: { orderId: string; type: Approval['type']; reason: string }, actor = 'system') { orderFor(tenantId, input.orderId); const approval: Approval = { id: id('APR'), tenantId, orderId: input.orderId, type: input.type, reason: input.reason, status: 'pending', createdAt: now() }; state.approvals.push(approval); record(tenantId, actor, 'approval.created', 'approval', approval.id, undefined, approval); emit(tenantId, 'approval.created', approval.id, approval); return clone(approval); }
export function decideApproval(tenantId: string, approvalId: string, input: { status: Exclude<ApprovalStatus, 'pending'>; comment?: string }, actor: string) { const approval = assertTenant(state.approvals.find(item => item.id === approvalId), tenantId, '审批不存在'); if (approval.status !== 'pending') throw new Error('审批已经决策'); const before = clone(approval); approval.status = input.status; approval.decidedBy = actor; approval.comment = input.comment; approval.decidedAt = now(); if (input.status === 'approved' && approval.type === 'credit_override') { const order = orderFor(tenantId, approval.orderId); const customer = customerFor(tenantId, order.customerId); customer.creditLimit = Math.max(customer.creditLimit, customer.creditUsed + order.totalAmount); } mutate(tenantId, actor, 'approval.decided', 'approval', approval.id, before, approval, 'approval.decided'); if (input.status === 'rejected' && approval.type === 'credit_override') { const order = orderFor(tenantId, approval.orderId); const activeReservations = activeReservationsForOrder(tenantId, order.id); for (const reservation of activeReservations) { const lot = lotFor(tenantId, reservation.lotId); if (lot.reserved < reservation.quantity) throw new Error(`批次 ${lot.lotCode} 预留账实不一致，拒绝授信拒绝释放`); } const orderBefore = clone(order); const released = releaseOrderReservations(tenantId, order.id, 'credit_approval_rejected', actor); if (['allocated', 'backordered'].includes(order.status) && released.length) { transition(order, 'confirmed'); mutate(tenantId, actor, 'order.credit-rejected', 'order', order.id, orderBefore, order, 'order.credit-rejected'); } } return clone(approval); }

export function operationSummary(tenantId: string) { tenant(tenantId); const orders = listOrders(tenantId); const invoices = state.invoices.filter(item => item.tenantId === tenantId); const shipments = state.shipments.filter(item => item.tenantId === tenantId); return { tenantId, generatedAt: now(), orderCount: orders.length, byStatus: orders.reduce<Record<string, number>>((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc; }, {}), grossMerchandiseValue: money(orders.reduce((sum, item) => sum + item.totalAmount, 0)), receivable: money(invoices.reduce((sum, item) => sum + item.total - item.paid, 0)), paid: money(invoices.reduce((sum, item) => sum + item.paid, 0)), delayedShipments: shipments.filter(item => item.status === 'exception').length, pendingApprovals: state.approvals.filter(item => item.tenantId === tenantId && item.status === 'pending').length, activeReservations: state.reservations.filter(item => item.tenantId === tenantId && item.status === 'active').reduce((sum, item) => sum + item.quantity, 0), backorderedOrders: orders.filter(item => item.status === 'backordered').length, inventory: state.inventory.filter(item => item.tenantId === tenantId).map(item => ({ warehouse: item.warehouse, sku: item.sku, available: item.available, reserved: item.reserved, free: item.available - item.reserved, version: item.version })) }; }
export function timeline(tenantId: string, orderId: string) { const order = orderFor(tenantId, orderId); const relatedIds = new Set([order.id]); const shipment = state.shipments.find(item => item.orderId === orderId); const customs = state.customs.find(item => item.orderId === orderId); const invoice = state.invoices.find(item => item.orderId === orderId); if (shipment) relatedIds.add(shipment.id); if (customs) relatedIds.add(customs.id); if (invoice) relatedIds.add(invoice.id); state.approvals.filter(item => item.orderId === orderId).forEach(item => relatedIds.add(item.id)); state.allocationPlans.filter(item => item.tenantId === tenantId && item.orderId === orderId).forEach(item => { relatedIds.add(item.id); if (item.reservationExpiresAt) relatedIds.add(item.id); }); state.reservations.filter(item => item.tenantId === tenantId && item.orderId === orderId).forEach(item => relatedIds.add(item.id)); return state.audit.filter(item => item.tenantId === tenantId && relatedIds.has(item.entityId)).sort((a, b) => b.at.localeCompare(a.at)).map(clone); }
export function listAudit(tenantId: string, limit = 100) { tenant(tenantId); return state.audit.filter(item => item.tenantId === tenantId).slice(0, Math.min(limit, 500)).map(clone); }
export function listOutbox(tenantId: string, status?: OutboxEvent['status']) { tenant(tenantId); return state.outbox.filter(item => item.tenantId === tenantId && (!status || item.status === status)).map(clone); }
export function publishOutbox(tenantId: string, eventId: string, actor = 'system') { const event = assertTenant(state.outbox.find(item => item.id === eventId), tenantId, '事件不存在'); if (event.status === 'published') return clone(event); event.status = 'published'; event.attempts += 1; record(tenantId, actor, 'outbox.published', 'outbox', event.id, { status: 'pending' }, event); return clone(event); }

// seed a coherent flow for demos: one order is allocated, one customs declaration is cleared, and one invoice is partially paid.
const seeded = createOrder('tenant-acme', { customerId: 'CUS-001', reference: 'PO-2026-0918', origin: '上海保税区', destination: '鹿特丹', priority: 'urgent', items: [{ sku: 'SENSOR-X9', description: '工业温度传感器', quantity: 10, unitPrice: 180, weightKg: 2.4, hsCode: '9025.19' }, { sku: 'CONTROL-M2', description: '边缘控制模块', quantity: 4, unitPrice: 420, weightKg: 3.2, hsCode: '8537.10' }] });
confirmOrder('tenant-acme', seeded.id); allocateOrder('tenant-acme', seeded.id); const seededDeclaration = createCustomsDeclaration('tenant-acme', { orderId: seeded.id }); updateCustoms('tenant-acme', seededDeclaration.id, { documentRefs: ['commercial-invoice', 'packing-list', 'origin-certificate'], status: 'submitted' }); updateCustoms('tenant-acme', seededDeclaration.id, { status: 'cleared' }); dispatchOrder('tenant-acme', seeded.id); const seededInvoice = generateInvoice('tenant-acme', seeded.id); recordPayment('tenant-acme', { invoiceId: seededInvoice.id, amount: 500, method: 'bank_transfer', reference: 'BANK-DEMO-001' });
