import { useState } from "react";
import { ComponentRecord, DiseaseRecord } from "../business/componentLedger";
import {
  EditableValues,
  RulesState,
  RuleOutput,
  SurveyBatch,
  commitResurvey,
  startResurvey,
  submitResurvey,
  updateResurveyDraft,
} from "../business/batchRules";
import { Badge, Panel } from "./ui";

type RunRule = (run: (data: RulesState) => RuleOutput) => void;

function DiseaseEditor({
  diseases,
  onChange,
  disabled,
}: {
  diseases: DiseaseRecord[];
  onChange: (diseases: DiseaseRecord[]) => void;
  disabled: boolean;
}) {
  const update = (index: number, patch: Partial<DiseaseRecord>) => {
    onChange(
      diseases.map((disease, i) => (i === index ? { ...disease, ...patch } : disease))
    );
  };
  const remove = (index: number) =>
    onChange(diseases.filter((_, i) => i !== index));
  const add = () =>
    onChange([
      ...diseases,
      {
        id: `D-R-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: "端部开裂",
        position: "",
      },
    ]);

  return (
    <div className="disease-editor">
      {diseases.map((disease, index) => (
        <div key={disease.id} className="inline-form tight">
          <input
            value={disease.type}
            disabled={disabled}
            onChange={(e) => update(index, { type: e.target.value })}
            placeholder="病害类型"
          />
          <input
            value={disease.position}
            disabled={disabled}
            onChange={(e) => update(index, { position: e.target.value })}
            placeholder="位置"
          />
          {!disabled ? (
            <button className="danger ghost" onClick={() => remove(index)}>
              删除
            </button>
          ) : null}
        </div>
      ))}
      {!disabled ? (
        <button className="ghost small-btn" onClick={add}>
          + 增加病害
        </button>
      ) : diseases.length === 0 ? (
        <span className="muted-text">无病害</span>
      ) : null}
    </div>
  );
}

export function ResurveyPanel({
  batch,
  components,
  runRule,
}: {
  batch: SurveyBatch;
  components: ComponentRecord[];
  runRule: RunRule;
}) {
  const [newSurveyor, setNewSurveyor] = useState("");

  if (batch.status === "sealed") {
    return (
      <Panel title="补测工单" subtitle="尚未开工">
        <p className="hint">开工后的批次才可发起补测。</p>
      </Panel>
    );
  }

  if (batch.status === "active" && !batch.resurvey) {
    return (
      <Panel title="补测工单" subtitle="关系边与修缮建议版本管理">
        <p className="hint">
          发起补测后，将<b>冻结原批的关系边和修缮建议</b>（当前版本只读）；
          新值录入后须由<b>换人两次确认</b>，通过才按新值重算并生成新版本，旧版永久只读。
        </p>
        <button
          className="primary"
          onClick={() => runRule((data) => startResurvey(data, batch.id))}
        >
          发起补测（冻结原批关系边与建议）
        </button>
      </Panel>
    );
  }

  const draft = batch.resurvey!;
  const frozenVersion = batch.versions[batch.versions.length - 1];

  const patch = (componentId: string, values: Partial<EditableValues>) =>
    runRule((data) =>
      updateResurveyDraft(data, batch.id, componentId, values)
    );

  return (
    <Panel
      title={`补测工单 · ${batch.id}`}
      subtitle={`原批 v${frozenVersion.version} 冻结中 · 测绘员 ${draft.previousSurveyor}`}
      actions={<Badge>补测冻结</Badge>}
    >
      <div className="resurvey-banner warn-box">
        原批 v{frozenVersion.version}（{draft.previousSurveyor} · {frozenVersion.sealedAt}）
        的关系边与修缮建议已冻结，关系图中仍按旧版只读展示；下表录入的新值在两次确认通过前不会生效。
      </div>

      <div className="table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>编号 / 构件</th>
              <th>新含水率(%)</th>
              <th>新变形情况</th>
              <th>新病害记录</th>
            </tr>
          </thead>
          <tbody>
            {components.map((component) => {
              const values = draft.componentValues[component.id];
              if (!values) return null;
              return (
                <tr key={component.id}>
                  <td>
                    <b>{component.id}</b>
                    <div className="muted-text">{component.name}</div>
                    <div className="muted-text">木种/截面/榫型锁定</div>
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      value={values.moisture ?? ""}
                      placeholder={component.moisture === null ? "原批缺失" : `${component.moisture ?? ""}`}
                      onChange={(e) =>
                        patch(component.id, {
                          moisture: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      value={values.deformation}
                      onChange={(e) =>
                        patch(component.id, { deformation: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <DiseaseEditor
                      diseases={values.diseases}
                      disabled={false}
                      onChange={(diseases) => patch(component.id, { diseases })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="confirm-track">
        <div className={`confirm-step ${draft.step >= 0 ? "reached" : ""}`}>
          <b>① 换人录入并提交</b>
          <small>新测绘员必须与原批「{draft.previousSurveyor}」不同</small>
          <div className="inline-form tight">
            <input
              placeholder="新测绘员姓名"
              value={draft.step === 1 ? draft.surveyor : newSurveyor}
              disabled={draft.step === 1}
              onChange={(e) => setNewSurveyor(e.target.value)}
            />
            <button
              className="primary"
              disabled={draft.step === 1}
              onClick={() =>
                runRule((data) =>
                  submitResurvey(data, batch.id, newSurveyor)
                )
              }
            >
              第一次确认：换人提交
            </button>
          </div>
        </div>
        <div className={`confirm-step ${draft.step === 1 ? "reached" : ""}`}>
          <b>② 复核后按新值重算</b>
          <small>
            {draft.submittedAt
              ? `已于 ${draft.submittedAt} 提交，请最终复核（再改新值将回到第一步）`
              : "等待第一次确认"}
          </small>
          <button
            className="primary"
            disabled={draft.step !== 1}
            onClick={() => runRule((data) => commitResurvey(data, batch.id))}
          >
            第二次确认：按新值重算关系边与建议
          </button>
        </div>
      </div>
    </Panel>
  );
}
