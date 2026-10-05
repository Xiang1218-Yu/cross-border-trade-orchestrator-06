# CrossBorder Flow｜跨境供应链履约与结算编排服务

一个纯后端、Node.js + TypeScript 的复杂业务项目。它把跨境订单、库存锁定、分段运输、海关申报、计费开票、收款核销、异常审批、审计和事件投递串成一个可追踪的履约闭环。

## 业务边界

- **订单编排**：订单状态机、信用额度校验、幂等创建、乐观版本控制。
- **库存与分配**：可解释的两阶段分配。`POST /api/orders/:id/allocation-plans` 只读生成候选方案（按有效期 FEFO、仓库、运输起点、优先级排序，逐行给出选择理由，**不修改 reserved**）；`POST /api/allocation-plans/:id/confirm` 原子确认并回写预留，确认前重新校验批次实时可用量与订单剩余需求，防止两个方案/订单竞争同一批库存。策略：`all_or_nothing`（部分不足即整单失败）或 `partial_backorder`（先预留可分配部分，订单进入 `awaiting_stock` 待补货，补货后二次规划补齐）。取消、信用审批驳回、海关退回、预留过期（`POST /api/inventory/sweep-expired`）都会释放正确数量，audit/timeline/outbox 与真实 lot/reservation 状态保持一致。
- **跨境运输**：支持多段运输和里程碑事件，基于事件自动更新预计到达时间和延误状态。
- **海关合规**：申报单、单证完整性校验、查验/放行/退回，未放行订单禁止出运。
- **计费结算**：按重量、燃油附加费、关务服务费、优先级计算应收；生成发票并支持部分收款和核销。
- **异常与审批**：信用超额、海关退回、运输延误等异常进入审批流；审批决定会影响订单动作。
- **可观测性**：审计事件、Outbox 事件、运营指标、订单全链路时间线。

## 启动

```bash
cd "/Users/tog/Documents/ChatGPT/play/professional-platforms/cross-border-trade-orchestrator"
npm install
npm run dev
```

默认监听 `http://localhost:4120`。

## 演示租户与请求头

所有业务 API 默认要求 `x-tenant-id: tenant-acme`。演示数据已经包含订单、库存、运输段、海关申报、发票和一笔部分收款。

```bash
curl -H 'x-tenant-id: tenant-acme' http://localhost:4120/api/operations/summary
```
