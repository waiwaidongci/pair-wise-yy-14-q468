import { useMemo, useState } from "react";
import { Component, hasThroughCrack } from "../business/ledger";
import {
  ReplacementLine,
  validateReplacementOrder,
} from "../business/batchRules";
import { useAppState, dispatch } from "../business/pageState";
import { BuildingView } from "../business/selectBuildingView";

export default function ReleaseStation({ view }: { view: BuildingView }) {
  const components = useAppState((s) => s.components);
  const [lines, setLines] = useState<ReplacementLine[]>([]);
  const [applicant, setApplicant] = useState("");

  const batch = view.batch;
  const frozen = view.frozen;
  const readOnly = !!view.snapshot;
  const started = batch?.status === "已开工";
  const stock = components.filter((c) => c.stock);

  const crackSources = view.activeMembers.filter(hasThroughCrack);

  const addLine = () => {
    const first = crackSources[0];
    if (first) setLines((ls) => [...ls, { sourceId: first.id, stockId: "" }]);
  };
  const updateLine = (i: number, patch: Partial<ReplacementLine>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) =>
    setLines((ls) => ls.filter((_, idx) => idx !== i));

  const completeLines = lines.filter((l) => l.sourceId && l.stockId);
  const issues = useMemo(
    () =>
      batch && !readOnly
        ? validateReplacementOrder(components, batch, completeLines)
        : [],
    [components, batch, completeLines, readOnly]
  );
  const issueKey = new Set(issues.map((i) => `${i.sourceId}|${i.stockId}`));

  const submit = () => {
    if (!applicant.trim() || completeLines.length === 0) return;
    dispatch({ type: "submitOrder", lines: completeLines, applicant });
    setLines([]);
    setApplicant("");
  };

  return (
    <section className="panel release-panel">
      <div className="heading">
        <div>
          <p>替代构件放行台</p>
          <h2>贯穿裂缝 · 替代件整单放行</h2>
        </div>
      </div>

      <div className="rule-strip">
        <b>放行规则：</b>
        仅贯穿裂缝构件可申请；备用件须木种、截面、榫型一致且未被其他批次占用；
        申请单多行合并校验，<em>任一行不合规则整单退回，不预留任何占用</em>。
      </div>

      {readOnly && <div className="banner banner-readonly">历史版本视图，放行台只读。</div>}
      {frozen && <div className="banner banner-frozen">补测冻结期间不受理替代件放行，请先完成或放弃补测。</div>}
      {!batch && <div className="banner banner-readonly">该建筑尚未封样，无法受理放行单。</div>}
      {batch && !started && !frozen && (
        <div className="banner banner-readonly">批次「{batch.status}」，开工后方可提交替代件放行。</div>
      )}

      {!readOnly && started && (
        <div className="order-form">
          <div className="order-head">
            <h3>新放行单{lines.length > 0 ? `（${lines.length} 行）` : ""}</h3>
            <button className="ghost" onClick={addLine} disabled={crackSources.length === 0}>
              + 添加替代申请行
            </button>
          </div>

          {crackSources.length === 0 && (
            <p className="hint">本建筑当前没有贯穿裂缝构件，无需申请替代件；其他病害按修缮建议处理。</p>
          )}

          {lines.map((line, i) => {
            const source = components.find((c) => c.id === line.sourceId);
            const picked = components.find((c) => c.id === line.stockId);
            const issue =
              line.stockId && issueKey.has(`${line.sourceId}|${line.stockId}`)
                ? issues.find((x) => x.sourceId === line.sourceId && x.stockId === line.stockId)
                : null;
            const occupiedByOther =
              picked && picked.stock && picked.buildingId !== "STOCK" && picked.buildingId !== batch?.buildingId;
            const mismatch = source && picked && picked.stock && (
              source.wood !== picked.wood ||
              source.section !== picked.section ||
              source.joint !== picked.joint
            );
            const lineOk = line.stockId && !issue && !occupiedByOther && !mismatch;

            return (
              <div key={i} className={`order-line ${issue ? "line-bad" : lineOk ? "line-ok" : ""}`}>
                <div className="order-line-grid">
                  <label>
                    <span>贯穿裂缝原构件</span>
                    <select
                      value={line.sourceId}
                      onChange={(e) => updateLine(i, { sourceId: e.target.value, stockId: "" })}
                    >
                      {crackSources.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id}（{c.wood}/{c.section}/{c.joint}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="arrow">→</span>
                  <label>
                    <span>备用件（须三要素一致、在库）</span>
                    <select
                      value={line.stockId}
                      onChange={(e) => updateLine(i, { stockId: e.target.value })}
                    >
                      <option value="">请选择备用件</option>
                      {stock.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id} {s.wood}/{s.section}/{s.joint}
                          {s.buildingId === "STOCK" ? "（在库）" : `（占用→${s.buildingId}）`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="ghost line-del" onClick={() => removeLine(i)}>
                    移除
                  </button>
                </div>
                {issue && <p className="line-msg bad">✗ {issue.reason}</p>}
                {lineOk && (
                  <p className="line-msg ok">
                    ✓ 三要素一致、在库未占用（{picked!.wood}/{picked!.section}/{picked!.joint}）
                  </p>
                )}
              </div>
            );
          })}

          {lines.length > 0 && (
            <div className="order-foot">
              <label className="inline-name">
                <span>申请人</span>
                <input
                  value={applicant}
                  placeholder="放行申请人姓名"
                  onChange={(e) => setApplicant(e.target.value)}
                />
              </label>
              <div className="order-actions">
                <span className={`check-summary ${issues.length ? "bad" : "ok"}`}>
                  {completeLines.length === 0
                    ? "请为每行选定备用件"
                    : issues.length
                      ? `预检：${issues.length} 行不合规，提交将整单退回且不占用`
                      : `预检：${completeLines.length} 行全部合规，可一次性提交放行`}
                </span>
                <button
                  className="primary"
                  onClick={submit}
                  disabled={!applicant.trim() || completeLines.length === 0 || completeLines.length !== lines.length}
                >
                  整单提交放行
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <StockTable stock={stock} buildingId={view.batch?.buildingId} />

      <div className="order-history">
        <h3>放行单记录</h3>
        {(batch?.orders ?? []).length === 0 && <p className="hint">本批次暂无放行单。</p>}
        {[...(batch?.orders ?? [])].reverse().map((o) => (
          <article key={o.id} className={`order-record ${o.status === "已退回" ? "rec-bad" : "rec-ok"}`}>
            <header>
              <b>{o.id}</b>
              <span className={`tag ${o.status === "已退回" ? "tag-return" : "tag-pass"}`}>{o.status}</span>
              <time>{o.date} · {o.applicant}</time>
            </header>
            <p className="order-lines">
              {o.lines.map((l) => `${l.sourceId} → ${l.stockId}`).join("　")}
            </p>
            <p className="order-reason">{o.reason}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function StockTable({
  stock,
  buildingId,
}: {
  stock: Component[];
  buildingId: string | undefined;
}) {
  return (
    <div className="stock-table">
      <h3>备用构件台账</h3>
      <table>
        <thead>
          <tr>
            <th>编号</th>
            <th>木种</th>
            <th>截面</th>
            <th>榫型</th>
            <th>含水率</th>
            <th>占用状态</th>
          </tr>
        </thead>
        <tbody>
          {stock.map((s) => {
            const free = s.buildingId === "STOCK";
            const here = !free && s.buildingId === buildingId;
            return (
              <tr key={s.id} className={free ? "" : here ? "occ-here" : "occ-other"}>
                <td>{s.id}</td>
                <td>{s.wood}</td>
                <td>{s.section}</td>
                <td>{s.joint}</td>
                <td>{s.moisture ?? "—"}%</td>
                <td>
                  {free ? (
                    <span className="tag tag-free">在库可占用</span>
                  ) : here ? (
                    <span className="tag tag-pass">已被本批次占用（替代 {s.releasedFrom}）</span>
                  ) : (
                    <span className="tag tag-return">已被其他批次占用（{s.buildingId}/{s.releasedFrom}）</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
