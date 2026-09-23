import { useMemo, useState } from "react";
import "./styles.css";
import { dispatch, useAppState } from "./business/pageState";
import { selectBuildingView } from "./business/selectBuildingView";
import { buildingMembers, hasThroughCrack, stockItems } from "./business/ledger";
import BatchConsole from "./components/BatchConsole";
import LedgerPanel from "./components/LedgerPanel";
import RelationGraph from "./components/RelationGraph";
import ReleaseStation from "./components/ReleaseStation";
import ResurveyPanel from "./components/ResurveyPanel";

const TABS = [
  { key: "ledger", label: "构件清单" },
  { key: "graph", label: "关系图" },
  { key: "release", label: "替代放行台" },
] as const;

function App() {
  const state = useAppState((s) => s);
  const [viewVersion, setViewVersion] = useState<number | null>(null);

  const view = useMemo(
    () =>
      selectBuildingView(
        state.components,
        state.batches,
        state.selectedBuildingId,
        viewVersion
      ),
    [state.components, state.batches, state.selectedBuildingId, viewVersion]
  );

  const building = state.buildings.find((b) => b.id === state.selectedBuildingId)!;

  const metrics = useMemo(() => {
    const members = buildingMembers(state.components, state.selectedBuildingId);
    const diseaseCount = members.reduce((n, c) => n + c.diseases.length, 0);
    const joints = new Set(members.map((c) => c.joint)).size;
    const cracks = members.filter(hasThroughCrack).length;
    return [
      { label: "在役构件", value: members.length },
      { label: "病害记录", value: diseaseCount },
      { label: "榫卯类型", value: joints },
      { label: "贯穿裂缝待替代", value: cracks },
      { label: "库内空闲备用件", value: stockItems(state.components).filter((s) => s.buildingId === "STOCK").length },
    ];
  }, [state.components, state.selectedBuildingId]);

  const frozen = view.batch?.status === "补测冻结";

  return (
    <main className="app">
      <header className="hero">
        <p>hxyfront-62013 · 古建木结构勘测</p>
        <h1>勘测批次封样与替代构件放行台</h1>
        <span>
          每栋建筑唯一封样批次；开工锁定木种、编号与截面，缺含水率 / 病害仅可补录；
          贯穿裂缝只能申请木种、截面、榫型一致且未被占用的替代件，否则整单退回不留占用；
          补测冻结原批关系边与建议，换人两次确认后按新值重算，旧版只读。
        </span>
      </header>

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <nav className="building-tabs">
        {state.buildings.map((b) => {
          const bBatch = state.batches.find((x) => x.buildingId === b.id);
          return (
            <button
              key={b.id}
              className={b.id === state.selectedBuildingId ? "bt-on" : ""}
              onClick={() => {
                dispatch({ type: "selectBuilding", buildingId: b.id });
                setViewVersion(null);
              }}
            >
              {b.name}
              {bBatch && <i className={`mini-badge mini-${bBatch.status}`}>{bBatch.status}</i>}
              {!bBatch && <i className="mini-badge mini-none">未封样</i>}
            </button>
          );
        })}
      </nav>

      <section className="workspace-wide">
        <BatchConsole
          building={building}
          batch={view.batch}
          viewVersion={viewVersion}
          onSeal={(sealedBy) => dispatch({ type: "seal", sealedBy })}
          onStart={() => dispatch({ type: "start" })}
          onViewVersion={setViewVersion}
          onReset={() => {
            dispatch({ type: "resetDemo" });
            setViewVersion(null);
          }}
        />

        <div className="main-area">
          <nav className="main-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={state.tab === t.key ? "mt-on" : ""}
                onClick={() => dispatch({ type: "selectTab", tab: t.key })}
              >
                {t.label}
              </button>
            ))}
            {view.batch && view.batch.status !== "已封样" && !view.snapshot && (
              <button
                className={frozen ? "mt-on pulse" : ""}
                onClick={() => dispatch({ type: "selectTab", tab: "ledger" })}
              >
                {frozen ? "● 补测冻结中" : "重测补算"}
              </button>
            )}
          </nav>

          {viewVersion !== null && (
            <div className="banner banner-readonly version-banner">
              正在回看 v{viewVersion}（{view.snapshot?.type} · {view.snapshot?.surveyor}）：
              清单与关系图为该版本冻结值，切换「当前值」恢复实时视图。
            </div>
          )}

          {state.tab === "ledger" && (
            <>
              <LedgerPanel view={view} />
              {view.batch && view.batch.status !== "已封样" && !view.snapshot && (
                <ResurveyPanel view={view} />
              )}
            </>
          )}
          {state.tab === "graph" && <RelationGraph view={view} />}
          {state.tab === "release" && <ReleaseStation view={view} />}
        </div>
      </section>

      <div className="notice-stack">
        {state.notices.map((n) => (
          <div key={n.id} className={`notice notice-${n.tone}`} onClick={() => dispatch({ type: "dismissNotice", id: n.id })}>
            {n.text}
          </div>
        ))}
      </div>
    </main>
  );
}

export default App;
