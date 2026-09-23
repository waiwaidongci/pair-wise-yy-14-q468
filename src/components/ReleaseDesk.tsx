import { useState } from "react";
import { RulesState, RuleOutput, releaseOrder, returnOrder } from "../business/batchRules";
import { Badge, Empty, Panel } from "./ui";

type RunRule = (run: (data: RulesState) => RuleOutput) => void;

const ORDER_STATUS_TEXT = {
  pending: "待放行",
  released: "已放行",
  returned: "已退回",
} as const;

export function ReleaseDesk({
  orders,
  stock,
  buildings,
  components,
  runRule,
}: {
  orders: RulesState["orders"];
  stock: RulesState["stock"];
  buildings: RulesState["buildings"];
  components: RulesState["components"];
  runRule: RunRule;
}) {
  const [operator, setOperator] = useState("");
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState("");

  const buildingName = (id: string) =>
    buildings.find((item) => item.id === id)?.name ?? id;
  const componentCode = (id: string) => {
    const component = components.find((item) => item.id === id);
    return component ? `${component.id} ${component.name}` : id;
  };
  const stockName = (id: string) => {
    const item = stock.find((s) => s.id === id);
    return item ? `${item.id} ${item.name}` : id;
  };
  const holderOf = (stockId: string) =>
    orders.find((order) => order.stockId === stockId && order.status !== "returned");

  const pending = orders.filter((order) => order.status === "pending");
  const history = orders.filter((order) => order.status !== "pending").reverse();

  return (
    <Panel
      title="替代构件放行台"
      subtitle={`待放行 ${pending.length} 单 · 历史 ${history.length} 单（跨全部批次）`}
    >
      <div className="inline-form release-operator">
        <input
          placeholder="放行人 / 复核人姓名"
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
        />
        <span className="hint">
          放行瞬间再次比对木种/截面/榫型与占用；冲突则整单退回、不留占用。
        </span>
      </div>

      <p className="eyebrow">待放行</p>
      {pending.length === 0 ? <Empty text="暂无待放行替代单" /> : null}
      <div className="order-list">
        {pending.map((order) => (
          <article key={order.id} className="order-card">
            <div className="order-head">
              <b>{order.id}</b>
              <Badge>{ORDER_STATUS_TEXT[order.status]}</Badge>
              <span className="muted-text">{buildingName(order.buildingId)} · {order.batchId}</span>
            </div>
            <div className="order-flow">
              <div>
                <small>原件（贯穿裂缝）</small>
                <b>{componentCode(order.sourceComponentId)}</b>
              </div>
              <span className="arrow">→</span>
              <div>
                <small>替代备料</small>
                <b>{stockName(order.stockId)}</b>
              </div>
            </div>
            <div className="order-meta muted-text">
              申请人 {order.createdBy} · {order.createdAt}
            </div>
            {returningId === order.id ? (
              <div className="inline-form">
                <input
                  placeholder="退回原因（选填）"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                />
                <button
                  className="danger"
                  onClick={() => {
                    runRule((data) =>
                      returnOrder(data, order.id, returnReason)
                    );
                    setReturningId(null);
                    setReturnReason("");
                  }}
                >
                  确认整单退回
                </button>
                <button
                  className="ghost"
                  onClick={() => {
                    setReturningId(null);
                    setReturnReason("");
                  }}
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="inline-form">
                <button
                  className="primary"
                  onClick={() =>
                    runRule((data) => releaseOrder(data, order.id, operator))
                  }
                >
                  复核一致，放行
                </button>
                <button
                  className="danger ghost"
                  onClick={() => setReturningId(order.id)}
                >
                  整单退回
                </button>
              </div>
            )}
          </article>
        ))}
      </div>

      <p className="eyebrow">已放行 / 已退回</p>
      <div className="table-wrap">
        <table className="order-table">
          <thead>
            <tr>
              <th>单号</th>
              <th>建筑 / 批次</th>
              <th>原件 → 替代件</th>
              <th>状态</th>
              <th>经办</th>
              <th>退回原因 / 备注</th>
            </tr>
          </thead>
          <tbody>
            {history.map((order) => (
              <tr key={order.id}>
                <td><b>{order.id}</b></td>
                <td>{buildingName(order.buildingId)} · {order.batchId}</td>
                <td>
                  {componentCode(order.sourceComponentId)} → {stockName(order.stockId)}
                </td>
                <td><Badge>{ORDER_STATUS_TEXT[order.status]}</Badge></td>
                <td>
                  申 {order.createdBy}
                  {order.releasedBy ? ` / 放 ${order.releasedBy}` : ""}
                </td>
                <td>
                  {order.status === "returned" ? (
                    <span className="danger-text">{order.returnReason}</span>
                  ) : (
                    <span className="ok-text">已出库占用 · {order.releasedAt}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="eyebrow">备用构件占用台账</p>
      <div className="table-wrap">
        <table className="order-table">
          <thead>
            <tr>
              <th>编号</th>
              <th>名称</th>
              <th>木种</th>
              <th>榫型</th>
              <th>截面</th>
              <th>占用状态</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((item) => {
              const holder = holderOf(item.id);
              return (
                <tr key={item.id}>
                  <td><b>{item.id}</b></td>
                  <td>{item.name}</td>
                  <td>{item.woodSpecies}</td>
                  <td>{item.tenonType}</td>
                  <td>{item.section}</td>
                  <td>
                    {holder ? (
                      <span>
                        <Badge>{holder.status === "released" ? "已放行占用" : "待放行占用"}</Badge>
                        <span className="muted-text">
                          {" "}{holder.id} · {holder.batchId}
                        </span>
                      </span>
                    ) : (
                      <Badge>未占用</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
