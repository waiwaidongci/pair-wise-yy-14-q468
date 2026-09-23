import { useState } from "react";
import { Building } from "../business/ledger";
import { BatchSnapshot, SurveyBatch } from "../business/batchRules";

interface Props {
  building: Building;
  batch: SurveyBatch | undefined;
  viewVersion: number | null;
  onSeal: (sealedBy: string) => void;
  onStart: () => void;
  onViewVersion: (version: number | null) => void;
  onReset: () => void;
}

const STATUS_STYLE: Record<string, string> = {
  已封样: "status-sealed",
  已开工: "status-active",
  补测冻结: "status-frozen",
};

export default function BatchConsole({
  building,
  batch,
  viewVersion,
  onSeal,
  onStart,
  onViewVersion,
  onReset,
}: Props) {
  const [name, setName] = useState("");

  return (
    <aside className="panel console">
      <div className="heading">
        <div>
          <p>勘测批次封样</p>
          <h2>{building.name}</h2>
        </div>
        <button className="ghost" onClick={onReset} title="恢复演示数据">
          重置演示
        </button>
      </div>

      {!batch ? (
        <div className="seal-box">
          <p className="hint">
            每栋建筑只保留一个封样批次。封样后木种、构件编号、截面尺寸将在开工时锁定。
          </p>
          <label>
            <span>封样测绘人</span>
            <input
              value={name}
              placeholder="填写测绘人姓名"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button className="primary" onClick={() => onSeal(name)}>
            发起封样
          </button>
          <p className="hint">若该建筑已有封样批次，重复发起将沿用首次封样，不另立新批。</p>
        </div>
      ) : (
        <div className="batch-box">
          <div className="batch-head">
            <span className={`badge ${STATUS_STYLE[batch.status]}`}>{batch.status}</span>
            <b>{batch.id}</b>
          </div>
          <dl className="meta">
            <div>
              <dt>封样时间</dt>
              <dd>{batch.sealedAt}</dd>
            </div>
            <div>
              <dt>首封测绘人</dt>
              <dd>{batch.sealedBy}（留档不变）</dd>
            </div>
            <div>
              <dt>当前测绘人</dt>
              <dd>{batch.currentSurveyor}</dd>
            </div>
            <div>
              <dt>封样构件</dt>
              <dd>{batch.componentIds.length} 件</dd>
            </div>
          </dl>

          <div className="actions">
            {batch.status === "已封样" && (
              <button className="primary" onClick={onStart}>
                开工（锁定木种 / 编号 / 截面）
              </button>
            )}
            {batch.status !== "已封样" && (
              <button className="ghost" onClick={() => onSeal(batch.sealedBy)}>
                再次发起封样（沿用首次）
              </button>
            )}
          </div>

          <div className="versions">
            <h3>版本留档</h3>
            <div className="chips chips-tight">
              <button
                className={viewVersion === null ? "chip-on" : ""}
                onClick={() => onViewVersion(null)}
              >
                当前值
              </button>
              {batch.snapshots.map((s: BatchSnapshot) => (
                <button
                  key={`${s.version}-${s.type}-${s.date}`}
                  className={viewVersion === s.version ? "chip-on" : s.type === "补测旧版" ? "chip-old" : ""}
                  onClick={() => onViewVersion(s.version)}
                  title={s.note}
                >
                  v{s.version} {s.type}
                </button>
              ))}
            </div>
            {viewVersion !== null && (
              <p className="hint frozen-hint">
                正在只读查看 v{viewVersion} 历史版本，清单与关系图均为该版本冻结值。
              </p>
            )}
          </div>

          <div className="timeline">
            <h3>批次流水</h3>
            <ol>
              {batch.timeline.map((line, i) => (
                <li key={`${i}-${line}`}>{line}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </aside>
  );
}
