import { Building, TENON_TYPES, TenonType } from "../business/componentLedger";
import { SurveyBatch } from "../business/batchRules";
import { Badge } from "./ui";

const STATUS_TEXT: Record<SurveyBatch["status"], string> = {
  sealed: "已封样",
  active: "开工中",
  resurveying: "补测冻结",
};

export function Sidebar({
  buildings,
  batches,
  selectedBuildingId,
  onSelect,
  filter,
  onFilter,
  onReset,
}: {
  buildings: Building[];
  batches: SurveyBatch[];
  selectedBuildingId: string;
  onSelect: (id: string) => void;
  filter: TenonType | "全部";
  onFilter: (filter: TenonType | "全部") => void;
  onReset: () => void;
}) {
  return (
    <aside className="panel sidebar">
      <p className="eyebrow">建筑总册</p>
      <h2>选择勘测建筑</h2>
      <div className="building-list">
        {buildings.map((building) => {
          const batch = batches.find((item) => item.buildingId === building.id);
          const active = building.id === selectedBuildingId;
          return (
            <button
              key={building.id}
              className={`building-item ${active ? "active" : ""}`}
              onClick={() => onSelect(building.id)}
            >
              <b>{building.name}</b>
              <small>{building.note}</small>
              <span className="building-status">
                {batch ? (
                  <Badge>{STATUS_TEXT[batch.status]}</Badge>
                ) : (
                  <Badge>未封样</Badge>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <p className="eyebrow">榫卯类型筛选</p>
      <div className="chips">
        {(["全部", ...TENON_TYPES] as const).map((item) => (
          <button
            key={item}
            className={filter === item ? "chip-on" : ""}
            onClick={() => onFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <p className="eyebrow">封样规则</p>
      <ul className="rule-list">
        <li>每栋建筑只保留一个封样批次，重复发起沿用首次。</li>
        <li>开工锁定木种、编号、截面；缺含水率或病害只能补录。</li>
        <li>贯穿裂缝只能申请替代件，木种/截面/榫型一致且未占用，否则整单退回不留占用。</li>
        <li>补测冻结原批关系边与修缮建议，换人两次确认后按新值重算，旧版只读。</li>
      </ul>

      <button className="ghost reset-btn" onClick={onReset}>
        恢复演示数据
      </button>
    </aside>
  );
}
