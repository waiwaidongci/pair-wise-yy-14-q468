import { useMemo, useState } from "react";
import {
  ComponentRecord,
  DiseaseRecord,
  StockComponent,
  TenonType,
  hasThroughCrack,
  missingDisease,
  missingMoisture,
  specMismatch,
} from "../business/componentLedger";
import {
  ReplacementOrder,
  RulesState,
  RuleOutput,
  SurveyBatch,
  createReplacementOrder,
  supplementDisease,
  supplementMoisture,
} from "../business/batchRules";
import { Badge, Panel } from "./ui";

type RunRule = (run: (data: RulesState) => RuleOutput) => void;

const DISEASE_PRESETS = ["贯穿裂缝", "柱脚糟朽", "表面糟朽", "拱瓣开裂", "端部开裂"];

/* --------------------------- 替代构件申请弹窗 --------------------------- */

function ReplacementModal({
  component,
  stock,
  orders,
  batch,
  onClose,
  runRule,
}: {
  component: ComponentRecord;
  stock: StockComponent[];
  orders: ReplacementOrder[];
  onClose: () => void;
  runRule: RunRule;
  batch: SurveyBatch;
}) {
  const [stockId, setStockId] = useState("");
  const [operator, setOperator] = useState("");
  const chosen = stock.find((item) => item.id === stockId);

  const occupied = (candidate: StockComponent) =>
    orders.find(
      (order) =>
        order.stockId === candidate.id && order.status !== "returned"
    );

  const warnings = chosen ? specMismatch(chosen, component) : [];
  const holder = chosen ? occupied(chosen) : undefined;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>申请替代构件</h3>
        <p className="hint">
          原件 <b>{component.id} {component.name}</b> 存在
          <b className="danger-text"> 贯穿裂缝</b>，只能申请替代件。
          木种 / 截面 / 榫型必须一致且未被其他批次占用，否则
          <b className="danger-text">整单退回且不留占用</b>。
        </p>
        <div className="spec-strip">
          <span>要求木种：<b>{component.woodSpecies}</b></span>
          <span>截面：<b>{component.section}</b></span>
          <span>榫型：<b>{component.tenonType}</b></span>
        </div>

        <div className="stock-list">
          {stock.map((candidate) => {
            const holderOrder = occupied(candidate);
            const mismatch = specMismatch(candidate, component);
            const blocked = Boolean(holderOrder);
            return (
              <button
                key={candidate.id}
                className={`stock-row ${stockId === candidate.id ? "picked" : ""} ${
                  blocked ? "blocked" : ""
                }`}
                onClick={() => setStockId(candidate.id)}
              >
                <b>{candidate.id} · {candidate.name}</b>
                <small>
                  {candidate.woodSpecies} · {candidate.section} · {candidate.tenonType} · {candidate.remark}
                </small>
                <span className="stock-tags">
                  {mismatch.map((reason) => (
                    <Badge key={reason}>{reason.split("（")[0]}</Badge>
                  ))}
                  {blocked && holderOrder ? (
                    <Badge>已被 {holderOrder.batchId} 占用</Badge>
                  ) : (
                    <Badge>未占用</Badge>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {chosen && (warnings.length || holder) ? (
          <div className="warn-box">
            {warnings.map((reason) => (
              <div key={reason}>· {reason}</div>
            ))}
            {holder ? (
              <div>
                · 已被批次 {holder.batchId} 的单据 {holder.id}
                （{holder.status === "released" ? "已放行" : "待放行"}）占用
              </div>
            ) : null}
            <div>按此提交将生成一张「已退回」单，<b>不留任何占用</b>。</div>
          </div>
        ) : null}

        <div className="inline-form">
          <input
            placeholder="申请人姓名"
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
          />
          <button
            className="primary"
            disabled={!stockId}
            onClick={() => {
              runRule((data) =>
                createReplacementOrder(
                  data,
                  batch.id,
                  component.id,
                  stockId,
                  operator
                )
              );
              onClose();
            }}
          >
            提交申请
          </button>
          <button className="ghost" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ 补录弹窗 ------------------------------ */

function SupplementModal({
  component,
  kind,
  batchId,
  onClose,
  runRule,
}: {
  component: ComponentRecord;
  kind: "moisture" | "disease";
  batchId: string;
  onClose: () => void;
  runRule: RunRule;
}) {
  const [moisture, setMoisture] = useState("");
  const [type, setType] = useState("贯穿裂缝");
  const [position, setPosition] = useState("");

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          补录{kind === "moisture" ? "含水率" : "病害记录"} · {component.id}
        </h3>
        <p className="hint">开工后仅允许补录缺失项，补录完成后不可改录。</p>
        {kind === "moisture" ? (
          <div className="inline-form">
            <input
              placeholder="含水率（%），如 13.5"
              value={moisture}
              onChange={(e) => setMoisture(e.target.value)}
            />
            <button
              className="primary"
              onClick={() => {
                const value = Number(moisture);
                if (Number.isFinite(value)) {
                  runRule((data) =>
                    supplementMoisture(data, batchId, component.id, value)
                  );
                  onClose();
                }
              }}
            >
              确认补录
            </button>
            <button className="ghost" onClick={onClose}>取消</button>
          </div>
        ) : (
          <>
            <div className="inline-form">
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {DISEASE_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>{preset}</option>
                ))}
              </select>
              <input
                placeholder="病害位置，如 西端梁头"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
            </div>
            <div className="inline-form">
              <button
                className="primary"
                disabled={!position.trim()}
                onClick={() => {
                  runRule((data) =>
                    supplementDisease(data, batchId, component.id, {
                      type,
                      position,
                    })
                  );
                  onClose();
                }}
              >
                确认补录
              </button>
              <button className="ghost" onClick={onClose}>取消</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ 台账面板 ------------------------------ */

export function LedgerPanel({
  components,
  batch,
  orders,
  stock,
  filter,
  runRule,
}: {
  components: ComponentRecord[];
  batch: SurveyBatch | undefined;
  orders: ReplacementOrder[];
  stock: StockComponent[];
  filter: TenonType | "全部";
  runRule: RunRule;
}) {
  const [replaceFor, setReplaceFor] = useState<ComponentRecord | null>(null);
  const [supplement, setSupplement] = useState<{
    component: ComponentRecord;
    kind: "moisture" | "disease";
  } | null>(null);

  const rows = useMemo(
    () =>
      filter === "全部"
        ? components
        : components.filter((component) => component.tenonType === filter),
    [components, filter]
  );

  const locked = batch?.status === "active" || batch?.status === "resurveying";
  const frozen = batch?.status === "resurveying";

  return (
    <Panel
      title="构件台账"
      subtitle={`共 ${rows.length} 件${filter === "全部" ? "" : ` · 榫型：${filter}`}`}
    >
      {!batch ? (
        <p className="hint">未封样：可先在上方发起封样，再进行锁定、补录与替代件申请。</p>
      ) : null}
      <div className="table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>编号{locked ? " 🔒" : ""}</th>
              <th>构件</th>
              <th>木种{locked ? " 🔒" : ""}</th>
              <th>榫型</th>
              <th>截面{locked ? " 🔒" : ""}</th>
              <th>含水率</th>
              <th>病害</th>
              <th>变形</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((component) => {
              const activeOrder = orders.find(
                (order) =>
                  order.sourceComponentId === component.id &&
                  order.status !== "returned"
              );
              const needMoisture = missingMoisture(component);
              const needDisease = missingDisease(component);
              const through = hasThroughCrack(component);
              return (
                <tr key={component.id}>
                  <td>
                    <b>{component.id}</b>
                    {locked && <div className="lock-tag"><Badge>锁定</Badge></div>}
                  </td>
                  <td>{component.name}</td>
                  <td>{component.woodSpecies}</td>
                  <td>{component.tenonType}</td>
                  <td>{component.section}</td>
                  <td>
                    {component.moisture === null ? (
                      <span className="missing-cell">
                        <Badge>待补录</Badge>
                        {batch?.status === "active" ? (
                          <button
                            className="link-btn"
                            onClick={() =>
                              setSupplement({ component, kind: "moisture" })
                            }
                          >
                            补录
                          </button>
                        ) : null}
                      </span>
                    ) : (
                      `${component.moisture}%`
                    )}
                  </td>
                  <td>
                    {component.diseases.length === 0 ? (
                      <span className="missing-cell">
                        <Badge>待补录</Badge>
                        {batch?.status === "active" ? (
                          <button
                            className="link-btn"
                            onClick={() =>
                              setSupplement({ component, kind: "disease" })
                            }
                          >
                            补录
                          </button>
                        ) : null}
                      </span>
                    ) : (
                      <ul className="disease-list">
                        {component.diseases.map((disease: DiseaseRecord) => (
                          <li key={disease.id}>
                            <Badge>{disease.type}</Badge>
                            <span>{disease.position}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>{component.deformation || "—"}</td>
                  <td>
                    {batch?.status === "active" ? (
                      through ? (
                        activeOrder ? (
                          <span className="muted-text">
                            替代单 {activeOrder.id}
                            （{activeOrder.status === "released" ? "已放行" : "待放行"}）
                          </span>
                        ) : (
                          <button
                            className="primary small-btn"
                            onClick={() => setReplaceFor(component)}
                          >
                            申请替代件
                          </button>
                        )
                      ) : (
                        <span className="muted-text">非贯穿裂缝·不可替代</span>
                      )
                    ) : frozen ? (
                      <span className="warn-text">补测冻结中</span>
                    ) : batch ? (
                      <span className="muted-text">开工后可操作</span>
                    ) : (
                      <span className="muted-text">封样后可操作</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {replaceFor && batch ? (
        <ReplacementModal
          component={replaceFor}
          stock={stock}
          orders={orders}
          batch={batch}
          onClose={() => setReplaceFor(null)}
          runRule={runRule}
        />
      ) : null}
      {supplement && batch ? (
        <SupplementModal
          component={supplement.component}
          kind={supplement.kind}
          batchId={batch.id}
          onClose={() => setSupplement(null)}
          runRule={runRule}
        />
      ) : null}
    </Panel>
  );
}
