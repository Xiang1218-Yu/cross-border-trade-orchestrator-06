# CrossBorder Flow｜跨境供应链履约与结算编排服务

一个纯后端、Node.js + TypeScript 的复杂业务项目。它把跨境订单、库存锁定、分段运输、海关申报、计费开票、收款核销、异常审批、审计和事件投递串成一个可追踪的履约闭环。

## 业务边界

- **订单编排**：订单状态机、信用额度校验、幂等创建、乐观版本控制。
- **库存与分配**：按仓库和 SKU 锁定库存；防止超卖；分配结果写入订单时间线。
- **跨境运输**：支持多段运输和里程碑事件，基于事件自动更新预计到达时间和延误状态。
- **海关合规**：申报单、单证完整性校验、查验/放行/退回，未放行订单禁止出运。
- **计费结算**：按重量、燃油附加费、关务服务费、优先级计算应收；生成发票并支持部分收款和核销。
- **异常与审批**：信用超额、海关退回、运输延误等异常进入审批流；审批决定会影响订单动作。
- **可观测性**：审计事件、Outbox 事件、运营指标、订单全链路时间线。

## 可解释库存分配

库存分配采用“先生成候选方案、调用方确认后执行预留”的两阶段流程：

1. `POST /api/allocation-plans` 基于当前 `InventoryLot` 计算候选批次、评分、缺货数量和解释原因；此阶段不修改任何 `reserved`。
2. `POST /api/allocation-plans/{id}/confirm` 重新校验 SKU 已预留基线、`InventoryLot.version`、批次可用量与有效期；全部通过后才创建 `Reservation` 并增加批次 `reserved`。
3. 冲突时确认失败且不产生部分写入。持久化实现应对订单、方案及命中的批次使用数据库事务与 `SELECT ... FOR UPDATE SKIP LOCKED`/等价行锁，内存模块用 `version` 乐观锁模拟该边界。
4. `mode=fail_order` 时任何 SKU 不足都整单失败、不可确认；`mode=backorder` 可确认部分预留，订单进入 `backordered`，后续可继续生成补货方案。
5. 评分综合 FEFO 有效期、运输起点/目的地路由、首选仓库和批次优先级；候选结果返回每个批次的分项得分与中文解释。

释放原因会写入 reservation/plan/audit/outbox：订单取消、授信审批拒绝、报关 rejected、预留过期分别只释放当时仍为 active 的准确数量。出运时 active 预留才转为 consumed 并扣减 `available`。

### 库存分配 API

- `GET /api/orders/{id}/allocation-plans`
- `GET /api/orders/{id}/allocation-status`
- `POST /api/allocation-plans`
- `GET /api/allocation-plans/{id}`
- `POST /api/allocation-plans/{id}/confirm`
- `POST /api/allocation-plans/{id}/cancel`
- `POST /api/allocation-plans/expire`，可传 `{ "at": "2026-10-08T00:00:00.000Z" }` 供调度器或测试驱动方案/预留过期。

示例：

```bash
curl -X POST http://localhost:4120/api/allocation-plans \
  -H 'x-tenant-id: tenant-acme' -H 'content-type: application/json' \
  -d '{"orderId":"ORD-...","mode":"backorder","strategy":"auto","preferredWarehouses":["SHANGHAI-FTZ","ROTTERDAM-DC"]}'
```



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
