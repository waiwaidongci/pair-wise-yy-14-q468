import { useMemo, useState } from "react";
import {
  DISEASE_KINDS,
  DiseaseKind,
  DiseaseRecord,
  SEVERITIES,
  Severity,
} from "../business/ledger";
import { previewResurvey } from "../business/batchRules";
import { useAppState, dispatch } from "../business/pageState";
import { BuildingView } from "../business/selectBuildingView";

export default function ResurveyPanel({ view }: { view: BuildingView }) {
  const components = useAppState((s) => s.components);
  const batch = view.batch;
  const [name, setName] = useState("");

  const preview = useMemo(() => {
    if (!batch || !batch.resurvey) return null;
    return previewResurvey(components, batch);
  }, [components, batch]);

  if (!batch) return null;

  // 已开工（未补测）：只显示发起入口
  if (batch.status === "已开工" && !view.snapshot) {
    return (
      <section className="panel resurvey-panel">
        <div className="heading">
          <div>
            <p>重测补算</p>
            <h2>补测申请</h2>
          </div>
        </div>
        <p className="hint">
          发起补测后，原批关系边与修缮建议立即冻结为只读旧版；补测仅允许更新含水率、变形与病害，
          木种 / 编号 / 截面维持开工锁定。须由原测绘人以外的人员录入，并经两次确认后按新值重算。
        </p>
        <button className="primary" onClick={() => dispatch({ type: "startResurvey" })}>
          发起补测（冻结原批）
        </button>
      </section>
    );
  }

  if (batch.status !== "补测冻结" || !batch.resurvey || !preview) return null;

  const rs = batch.resurvey;
  const surveyorOk = name.trim() !== "" && name.trim() !== rs.oldSurveyor;

  return (
    <section className="panel resurvey-panel frozen-panel">
      <div className="heading">
        <div>
          <p>重测补算 · 进行中</p>
          <h2>补测冻结台</h2>
        </div>
        <span className="badge status-frozen">补测冻结</span>
      </div>

      <div className="banner banner-frozen">
        原批关系边与修缮建议已冻结为只读旧版（
        {[...batch.snapshots].reverse().find((s) => s.type === "补测旧版")
          ? `v${batch.snapshots[batch.snapshots.length - 1].version}`
          : ""}
        ），未完成两次确认前，清单与关系图保持旧版结果。
      </div>

      <div className="resurvey-grid">
        <div className="resurvey-drafts">
          <h3>新读数草案（不改木种 / 编号 / 截面）</h3>
          {rs.drafts.map((d) => {
            const c = components.find((x) => x.id === d.componentId);
            if (!c) return null;
            return (
              <DraftCard
                key={d.componentId}
                componentId={d.componentId}
                oldMoisture={c.moisture}
                moisture={d.moisture}
                deformation={d.deformation}
                diseases={d.diseases}
                oldDiseases={c.diseases}
              />
            );
          })}
        </div>

        <div className="resurvey-side">
          <div className="resurvey-people">
            <h3>换人确认</h3>
            <p className="hint">
              原测绘人：<b>{rs.oldSurveyor}</b>。补测须换人执行。
            </p>
            <label>
              <span>新测绘人姓名</span>
              <input
                value={name}
                placeholder="与原测绘人不同"
                onChange={(e) => {
                  setName(e.target.value);
                  dispatch({ type: "setResurveyor", name: e.target.value });
                }}
              />
            </label>
            {name.trim() && !surveyorOk && (
              <p className="line-msg bad">✗ 新测绘人不能与原测绘人相同</p>
            )}
            {surveyorOk && <p className="line-msg ok">✓ 换人登记通过：{name.trim()}</p>}
          </div>

          <div className="resurvey-preview">
            <h3>重算预览（确认后生效）</h3>
            <ul>
              {Object.entries(preview.suggestions).map(([id, s]) => (
                <li key={id}>
                  <b>{id}</b>：{s}
                </li>
              ))}
            </ul>
            <p className="hint">重算后关系边 {preview.edges.length} 条；旧版继续只读保留于版本留档。</p>
          </div>

          <div className="resurvey-actions">
            <button
              className="primary"
              disabled={!surveyorOk || !rs.draftsTouched}
              onClick={() => dispatch({ type: "confirmResurvey" })}
            >
              {rs.confirmStep === 0
                ? "第一次确认（核对新值）"
                : "第二次确认（执行重算并解冻）"}
            </button>
            <button className="ghost" onClick={() => dispatch({ type: "cancelResurvey" })}>
              放弃补测
            </button>
            <p className="hint">
              两次确认通过后按新值重算关系边与修缮建议；任一步修改读数需重新确认。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function DraftCard({
  componentId,
  oldMoisture,
  moisture,
  deformation,
  diseases,
  oldDiseases,
}: {
  componentId: string;
  oldMoisture: number | null;
  moisture: number | null;
  deformation: string;
  diseases: DiseaseRecord[];
  oldDiseases: DiseaseRecord[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DiseaseKind>("端部开裂");
  const [severity, setSeverity] = useState<Severity>("轻微");
  const [position, setPosition] = useState("");

  const addDisease = () => {
    if (!position.trim()) return;
    dispatch({
      type: "draftDisease",
      componentId,
      disease: {
        id: `TMP-${componentId}-${Date.now()}`,
        kind,
        severity,
        position: position.trim(),
        note: "",
        date: new Date().toISOString().slice(0, 10),
        source: "补测" as const,
      },
    });
    setPosition("");
  };

  return (
    <article className="draft-card">
      <button className="draft-head" onClick={() => setOpen(!open)}>
        <b>{componentId}</b>
        <span className={moisture !== oldMoisture ? "changed" : ""}>
          含水率 {oldMoisture === null ? "缺失" : `${oldMoisture}%`} → {moisture === null ? "缺失" : `${moisture}%`}
        </span>
        <span className={diseases.length !== oldDiseases.length ? "changed" : ""}>
          病害 {oldDiseases.length} → {diseases.length}
        </span>
        <span className="chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="draft-body">
          <label>
            <span>新含水率（%）</span>
            <input
              type="number"
              value={moisture ?? ""}
              placeholder="留空表示仍缺失"
              onChange={(e) =>
                dispatch({
                  type: "updateDraft",
                  componentId,
                  patch: { moisture: e.target.value === "" ? null : Number(e.target.value) },
                })
              }
            />
          </label>
          <label>
            <span>新变形情况</span>
            <input
              value={deformation}
              onChange={(e) =>
                dispatch({ type: "updateDraft", componentId, patch: { deformation: e.target.value } })
              }
            />
          </label>
          <div className="draft-disease-list">
            <span>草案病害（复测消除可核销）</span>
            {diseases.length === 0 && <p className="hint">无病害记录。</p>}
            {diseases.map((d) => (
              <div key={d.id} className="draft-disease-row">
                <i className={`dot sev-${d.severity}`} />
                {d.kind}（{d.severity}）· {d.position}
                <span className="src">{d.source}</span>
                <button
                  className="ghost mini-btn"
                  onClick={() =>
                    dispatch({ type: "draftRemoveDisease", componentId, diseaseId: d.id })
                  }
                >
                  核销
                </button>
              </div>
            ))}
          </div>
          <div className="draft-disease">
            <span>补测新增病害</span>
            <div className="supplement-row">
              <select value={kind} onChange={(e) => setKind(e.target.value as DiseaseKind)}>
                {DISEASE_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
              <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
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
              <button onClick={addDisease} disabled={!position.trim()}>
                加入草案
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
