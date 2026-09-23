import { useMemo, useState } from "react";
import {
  Component,
  DISEASE_KINDS,
  DiseaseKind,
  JOINT_TYPES,
  SEVERITIES,
  Severity,
} from "../business/ledger";
import { useAppState, dispatch } from "../business/pageState";
import { BuildingView } from "../business/selectBuildingView";
import DiseaseMarker from "./DiseaseMarker";

export default function LedgerPanel({ view }: { view: BuildingView }) {
  const components = useAppState((s) => s.components);
  const [jointFilter, setJointFilter] = useState<string>("全部");
  const [expanded, setExpanded] = useState<string | null>(null);

  const list = useMemo(
    () =>
      view.activeMembers.filter(
        (m) => jointFilter === "全部" || m.joint === jointFilter
      ),
    [view.activeMembers, jointFilter]
  );

  const readOnly = !!view.snapshot;
  const frozen = view.frozen;
  const started = view.batch?.status === "已开工";
  const canSupplement = started && !readOnly;

  return (
    <section className="panel ledger-panel">
      <div className="heading">
        <div>
          <p>构件台账</p>
          <h2>尺寸记录与病害标记</h2>
        </div>
        <div className="chips chips-tight">
          <button
            className={jointFilter === "全部" ? "chip-on" : ""}
            onClick={() => setJointFilter("全部")}
          >
            全部
          </button>
          {JOINT_TYPES.map((j) => (
            <button
              key={j}
              className={jointFilter === j ? "chip-on" : ""}
              onClick={() => setJointFilter(j)}
            >
              {j}
            </button>
          ))}
        </div>
      </div>

      {readOnly && (
        <div className="banner banner-readonly">
          历史版本只读视图（v{view.snapshot!.version} · {view.snapshot!.type} · {view.snapshot!.date}）：台账内容为封样留档，不可编辑。
        </div>
      )}
      {frozen && (
        <div className="banner banner-frozen">
          补测冻结中：原批关系边与修缮建议已冻结为只读旧版，补测两次确认前台账不接受补录。
        </div>
      )}

      <div className="ledger-list">
        {list.map((m) => (
          <LedgerCard
            key={m.id}
            component={m}
            allComponents={components}
            suggestion={view.suggestions[m.id] ?? ""}
            open={expanded === m.id}
            onToggle={() => setExpanded(expanded === m.id ? null : m.id)}
            canSupplement={canSupplement}
            readOnly={readOnly}
            versionDiseases={
              view.snapshot?.readingBy[m.id]?.diseases ?? null
            }
          />
        ))}
        {list.length === 0 && <p className="hint">当前筛选下没有在役构件。</p>}
      </div>

      {view.replaced.length > 0 && (
        <div className="replaced-box">
          <h3>下线封存构件（已替代）</h3>
          {view.replaced.map((m) => (
            <div key={m.id} className="replaced-row">
              <b>{m.id}</b>
              <span>
                {m.wood} · {m.section} · {m.joint}
              </span>
              <span className="tag tag-danger">贯穿裂缝</span>
              <span>替代件：{m.replacedBy}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LedgerCard({
  component: m,
  allComponents,
  suggestion,
  open,
  onToggle,
  canSupplement,
  readOnly,
  versionDiseases,
}: {
  component: Component;
  allComponents: Component[];
  suggestion: string;
  open: boolean;
  onToggle: () => void;
  canSupplement: boolean;
  readOnly: boolean;
  versionDiseases: Component["diseases"] | null;
}) {
  const [recordedBy, setRecordedBy] = useState("");
  const [moisture, setMoisture] = useState("");
  const [kind, setKind] = useState<DiseaseKind>("端部开裂");
  const [severity, setSeverity] = useState<Severity>("轻微");
  const [position, setPosition] = useState("");
  const [note, setNote] = useState("");

  const isReplacement = !!m.releasedFrom;
  const gapMoisture = m.moisture === null;
  const gapDisease = m.diseases.length === 0;
  const releasedFrom = m.releasedFrom
    ? allComponents.find((c) => c.id === m.releasedFrom)
    : null;

  const submitMoisture = () => {
    const value = Number(moisture);
    if (Number.isNaN(value)) return;
    dispatch({
      type: "supplement",
      componentId: m.id,
      kind: "含水率",
      moisture: value,
      recordedBy,
    });
    setMoisture("");
  };

  const submitDisease = () => {
    if (!position.trim()) return;
    dispatch({
      type: "supplement",
      componentId: m.id,
      kind: "病害记录",
      disease: { kind, severity, position: position.trim(), note: note.trim() },
      recordedBy,
    });
    setPosition("");
    setNote("");
  };

  return (
    <article className={`ledger-card ${open ? "open" : ""}`}>
      <button className="ledger-head" onClick={onToggle}>
        <div className="ledger-title">
          <b>{m.id}</b>
          {isReplacement && <span className="tag tag-repl">替代件</span>}
          {versionDiseases === null && m.diseases.some((d) => d.kind === "贯穿裂缝") && (
            <span className="tag tag-danger">贯穿裂缝·只能替代</span>
          )}
          {gapMoisture && <span className="tag tag-gap">缺含水率</span>}
          {gapDisease && <span className="tag tag-gap">缺病害记录</span>}
        </div>
        <div className="ledger-sub">
          <span>
            {m.wood} · {m.section} · {m.joint} · {m.role} · {m.bay}
          </span>
          <span className="chevron">{open ? "收起 ▲" : "展开 ▼"}</span>
        </div>
      </button>

      {open && (
        <div className="ledger-body">
          <div className="size-grid">
            <label>
              <span>木材种类（锁定）</span>
              <input value={m.wood} readOnly />
            </label>
            <label>
              <span>构件编号（锁定）</span>
              <input value={m.id} readOnly />
            </label>
            <label>
              <span>截面尺寸（锁定）</span>
              <input value={m.section} readOnly />
            </label>
            <label>
              <span>含水率</span>
              <input value={m.moisture === null ? "缺失·待补录" : `${m.moisture}%`} readOnly />
            </label>
          </div>

          <div className="deform">
            <span>变形情况：</span>
            {m.deformation || "无记录"}
            {isReplacement && releasedFrom && (
              <em>（入场替代 {releasedFrom.id}，继承其开间与构造角色）</em>
            )}
          </div>

          <DiseaseMarker component={m} overrideDiseases={versionDiseases ?? undefined} />
          <ul className="disease-list">
            {(versionDiseases ?? m.diseases).map((d, i) => (
              <li key={d.id}>
                <i className={`dot sev-${d.severity}`} />
                {i + 1}. {d.kind}（{d.severity}）· {d.position} · {d.note || "—"}
                <span className="src">{d.source}</span>
              </li>
            ))}
            {(versionDiseases ?? m.diseases).length === 0 && (
              <li className="hint">无病害记录。</li>
            )}
          </ul>

          <div className="suggestion">
            <span>修缮建议（系统派生）</span>
            <p>{suggestion || "—"}</p>
          </div>

          {canSupplement && (gapMoisture || gapDisease) && (
            <div className="supplement-box">
              <h4>缺项补录（开工后仅此入口可填）</h4>
              <label className="inline-name">
                <span>记录人</span>
                <input
                  value={recordedBy}
                  placeholder="补录记录人姓名"
                  onChange={(e) => setRecordedBy(e.target.value)}
                />
              </label>
              {gapMoisture && (
                <div className="supplement-row">
                  <input
                    type="number"
                    placeholder="含水率 %"
                    value={moisture}
                    onChange={(e) => setMoisture(e.target.value)}
                  />
                  <button onClick={submitMoisture} disabled={!recordedBy.trim()}>
                    补录含水率
                  </button>
                </div>
              )}
              {gapDisease && (
                <div className="supplement-disease">
                  <div className="supplement-row">
                    <select value={kind} onChange={(e) => setKind(e.target.value as DiseaseKind)}>
                      {DISEASE_KINDS.map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                    <select
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value as Severity)}
                    >
                      {SEVERITIES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="supplement-row">
                    <input
                      placeholder="病害位置"
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                    />
                  </div>
                  <div className="supplement-row">
                    <input
                      placeholder="描述（选填）"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <button onClick={submitDisease} disabled={!recordedBy.trim() || !position.trim()}>
                      补录病害记录
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {readOnly && <p className="hint">历史版本只读，补录入口关闭。</p>}
        </div>
      )}
    </article>
  );
}
