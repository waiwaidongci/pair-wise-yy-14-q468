import { useState } from "react";
import {
  RuleOutput,
  RulesState,
  SurveyBatch,
  sealBatch,
  startWork,
} from "../business/batchRules";
import { Badge, KeyVal, Panel } from "./ui";

type RunRule = (run: (data: RulesState) => RuleOutput) => void;

export function BatchPanel({
  buildingId,
  buildingName,
  batch,
  viewedVersion,
  runRule,
  onViewVersion,
}: {
  buildingId: string;
  buildingName: string;
  batch: SurveyBatch | undefined;
  viewedVersion: number | undefined;
  runRule: RunRule;
  onViewVersion: (batchId: string, version: number) => void;
}) {
  const [surveyor, setSurveyor] = useState("");

  if (!batch) {
    return (
      <Panel title="勘测批次封样" subtitle={`${buildingName} · 未封样`}>
        <p className="hint">
          该建筑尚无封样批次。封样后首封版本（v1）会固化当前构件清单、关系边与修缮建议；
          <b>每栋建筑只留一个封样批次，重复发起将沿用首次批次</b>。
        </p>
        <div className="inline-form">
          <input
            placeholder="封样测绘员姓名"
            value={surveyor}
            onChange={(e) => setSurveyor(e.target.value)}
          />
          <button
            className="primary"
            onClick={() => runRule((data) => sealBatch(data, buildingId, surveyor))}
          >
            发起封样
          </button>
          <button
            className="ghost"
            onClick={() =>
              runRule((data) =>
                sealBatch(data, buildingId, surveyor.trim() || "复测员")
              )
            }
            title="演示：再次发起以验证沿用首次批次"
          >
            重复发起（沿用首次）
          </button>
        </div>
      </Panel>
    );
  }

  const current = batch.versions[batch.versions.length - 1];
  const viewing = viewedVersion ?? current.version;
  const frozen = batch.status === "resurveying";

  return (
    <Panel
      title={`封样批次 ${batch.id}`}
      subtitle={`${buildingName} · ${frozen ? "补测冻结中" : "批次控制台"}`}
      actions={
        batch.status === "sealed" ? (
          <button
            className="primary"
            onClick={() => runRule((data) => startWork(data, batch.id))}
          >
            确认开工（锁定木种/编号/截面）
          </button>
        ) : undefined
      }
    >
      <div className="meta-grid">
        <KeyVal label="批次状态">
          <Badge>
            {batch.status === "sealed"
              ? "已封样"
              : batch.status === "active"
              ? "开工中"
              : "补测冻结"}
          </Badge>
        </KeyVal>
        <KeyVal label="封样测绘员">{batch.sealedBy}</KeyVal>
        <KeyVal label="封样时间">{batch.sealedAt}</KeyVal>
        <KeyVal label="开工时间">{batch.startedAt ?? "未开工"}</KeyVal>
        <KeyVal label="当前版本">
          v{current.version}（{current.surveyor}）
        </KeyVal>
        <KeyVal label="版本数">{batch.versions.length}</KeyVal>
      </div>

      <div className="lock-note">
        {batch.status === "sealed" ? (
          <span>
            封样待开工：木种、编号、截面仍可在台账中核对修改；开工后三项锁定，缺含水率或病害记录只能补录。
          </span>
        ) : frozen ? (
          <span className="warn-text">
            补测进行中：原批 v{current.version}
            的关系边与修缮建议已冻结只读，换人两次确认后按新值重算。
          </span>
        ) : (
          <span className="ok-text">
            已开工：木种、构件编号、截面锁定；含水率 / 病害缺失项可在台账中补录，贯穿裂缝走替代件放行。
          </span>
        )}
      </div>

      <div className="version-tabs">
        <span className="eyebrow">版本（旧版只读）</span>
        <div className="chips">
          {batch.versions.map((version) => {
            const isOld = version.version < current.version;
            const isView = viewing === version.version;
            return (
              <button
                key={version.version}
                className={isView ? "chip-on" : ""}
                onClick={() => onViewVersion(batch.id, version.version)}
                title={isOld ? "历史版本，只读" : "当前版本"}
              >
                v{version.version} · {version.surveyor}
                {isOld ? " · 只读" : ""}
              </button>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
