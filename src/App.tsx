import "./styles.css";
import { useMemo } from "react";
import { useSurveyStation } from "./business/pageState";
import { componentsOfBuilding, hasThroughCrack } from "./business/componentLedger";
import { currentVersion } from "./business/batchRules";
import { Sidebar } from "./components/Sidebar";
import { BatchPanel } from "./components/BatchPanel";
import { LedgerPanel } from "./components/LedgerPanel";
import { ResurveyPanel } from "./components/ResurveyPanel";
import { ReleaseDesk } from "./components/ReleaseDesk";
import { RelationGraph } from "./components/RelationGraph";

function App() {
  const {
    state,
    runRule,
    selectedBuilding,
    selectBuilding,
    setFilter,
    viewVersion,
    dismissNotice,
    resetDemo,
  } = useSurveyStation();

  const { data } = state;
  const buildingComponents = useMemo(
    () => componentsOfBuilding(data.components, selectedBuilding.id),
    [data.components, selectedBuilding.id]
  );
  const batch = data.batches.find((item) => item.buildingId === selectedBuilding.id);
  const viewedVersionNumber = batch
    ? state.viewedVersionByBatch[batch.id] ??
      batch.versions[batch.versions.length - 1].version
    : undefined;
  const viewedVersion = batch
    ? batch.versions.find((version) => version.version === viewedVersionNumber) ??
      currentVersion(batch)
    : null;

  const totalComponents = data.components.length;
  const diseasePoints = data.components.reduce(
    (sum, component) => sum + component.diseases.length,
    0
  );
  const tenonKinds = new Set(data.components.map((component) => component.tenonType)).size;
  const throughCount = data.components.filter(hasThroughCrack).length;
  const pendingOrders = data.orders.filter((order) => order.status === "pending").length;

  return (
    <main className="app station">
      <section className="hero">
        <p>hxyfront-62013 · 古建木结构 · 勘测批次封样与替代构件放行台</p>
        <h1>榫卯勘测批次封样与替代构件放行台</h1>
        <span>
          测绘员在此完成单栋建筑的封样批次管理：开工锁定木种、编号、截面，缺项仅可补录；
          贯穿裂缝走替代件放行（木种 / 截面 / 榫型一致且未占用，否则整单退回不留占用）；
          补测冻结原批关系边与修缮建议，换人两次确认后按新值重算，旧版只读。全部数据本地持久化，刷新后清单、关系图与批次状态一致。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>构件数量</small>
          <strong>{totalComponents}</strong>
        </article>
        <article>
          <small>病害点</small>
          <strong>{diseasePoints}</strong>
        </article>
        <article>
          <small>榫卯类型</small>
          <strong>{tenonKinds}</strong>
        </article>
        <article>
          <small>贯穿裂缝 / 待放行</small>
          <strong>{throughCount} / {pendingOrders}</strong>
        </article>
      </section>

      <div className="toast-stack">
        {state.notices.map((notice) => (
          <div key={notice.id} className={`toast toast-${notice.kind}`}>
            <span>{notice.text}</span>
            <button onClick={() => dismissNotice(notice.id)}>×</button>
          </div>
        ))}
      </div>

      <section className="workspace station-grid">
        <Sidebar
          buildings={data.buildings}
          batches={data.batches}
          selectedBuildingId={selectedBuilding.id}
          onSelect={selectBuilding}
          filter={state.tenonFilter}
          onFilter={setFilter}
          onReset={resetDemo}
        />

        <div className="station-main">
          <BatchPanel
            buildingId={selectedBuilding.id}
            buildingName={selectedBuilding.name}
            batch={batch}
            viewedVersion={viewedVersionNumber}
            runRule={runRule}
            onViewVersion={viewVersion}
          />

          <LedgerPanel
            components={buildingComponents}
            batch={batch}
            orders={data.orders}
            stock={data.stock}
            filter={state.tenonFilter}
            runRule={runRule}
          />

          {batch ? (
            <ResurveyPanel
              batch={batch}
              components={buildingComponents}
              runRule={runRule}
            />
          ) : null}

          <RelationGraph
            buildingName={selectedBuilding.name}
            version={viewedVersion}
            links={selectedBuilding.links}
            isOld={
              Boolean(batch) &&
              viewedVersionNumber! < batch!.versions[batch!.versions.length - 1].version
            }
            frozen={batch?.status === "resurveying"}
          />
        </div>
      </section>

      <ReleaseDesk
        orders={data.orders}
        stock={data.stock}
        buildings={data.buildings}
        components={data.components}
        runRule={runRule}
      />

      <footer className="station-foot">
        关系边状态与修缮建议均按封样版本快照冻结；补测重算仅追加新版本，不覆盖旧版。
      </footer>
    </main>
  );
}

export default App;
