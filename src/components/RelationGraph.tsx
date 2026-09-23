import { Component, EdgeHealth, RelationEdge } from "../business/ledger";
import { BuildingView } from "../business/selectBuildingView";

const ROLE_LAYER: Record<string, number> = {
  檩: 0,
  梁: 1,
  斗拱: 1,
  枋: 2,
  柱: 3,
};
const LAYER_LABEL = ["檩层", "梁/斗拱层", "枋层", "柱层"];

const EDGE_COLOR: Record<EdgeHealth, string> = {
  正常: "#0f766e",
  关注: "#b45309",
  危险: "#b91c1c",
};

const WIDTH = 880;
const LAYER_H = 120;
const TOP = 36;
const PAD_X = 96;

interface NodePos {
  c: Component;
  x: number;
  y: number;
}

export default function RelationGraph({ view }: { view: BuildingView }) {
  // 旧版 / 冻结视图中的节点集合以快照 readingBy 为准（已下线件不在快照中）
  const snapshotIds = view.snapshot
    ? Object.keys(view.snapshot.readingBy)
    : null;
  const nodes: Component[] = snapshotIds
    ? snapshotIds
        .map((id) => view.activeMembers.find((m) => m.id === id))
        .filter((c): c is Component => !!c)
    : view.activeMembers;

  const bays = Array.from(new Set(nodes.map((n) => n.bay)));
  const bayW = (WIDTH - PAD_X * 2) / Math.max(bays.length, 1);

  const positions: Record<string, NodePos> = {};
  for (let bi = 0; bi < bays.length; bi++) {
    const bay = bays[bi];
    for (let layer = 0; layer < 4; layer++) {
      const row = nodes.filter(
        (n) => n.bay === bay && ROLE_LAYER[n.role] === layer
      );
      row.forEach((c, i) => {
        const slot = 1 / (row.length + 1);
        positions[c.id] = {
          c,
          x: PAD_X + bi * bayW + bayW * slot * (i + 1),
          y: TOP + layer * LAYER_H + 34,
        };
      });
    }
  }

  const height = TOP + 4 * LAYER_H + 10;

  return (
    <section className="panel graph-panel">
      <div className="heading">
        <div>
          <p>单栋建筑构件关系视图</p>
          <h2>榫卯关系图{view.snapshot ? `（v${view.snapshot.version} 只读）` : view.frozen ? "（补测冻结）" : ""}</h2>
        </div>
        <Legend />
      </div>

      <div className="graph-scroll">
        <svg viewBox={`0 0 ${WIDTH} ${height}`} className="graph-svg">
          {/* 层标签 */}
          {LAYER_LABEL.map((label, layer) => (
            <text key={label} x="12" y={TOP + layer * LAYER_H + 38} fontSize="11" fill="#64748b">
              {label}
            </text>
          ))}

          {/* 开间分隔 */}
          {bays.map((bay, bi) => (
            <g key={bay}>
              <text x={PAD_X + bi * bayW + bayW / 2} y="18" textAnchor="middle" fontSize="12" fill="#854d0e" fontWeight="700">
                {bay}
              </text>
              {bi > 0 && (
                <line
                  x1={PAD_X + bi * bayW}
                  y1={24}
                  x2={PAD_X + bi * bayW}
                  y2={height - 24}
                  stroke="#e2e8f0"
                  strokeDasharray="4 6"
                />
              )}
            </g>
          ))}

          {/* 关系边 */}
          {view.edges.map((e: RelationEdge) => {
            const a = positions[e.from];
            const b = positions[e.to];
            if (!a || !b) return null;
            const color = EDGE_COLOR[e.health];
            return (
              <g key={e.id}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={color}
                  strokeWidth={e.health === "危险" ? 2.6 : 1.6}
                  strokeDasharray={e.health === "关注" ? "7 4" : undefined}
                />
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 4}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill={color}
                >
                  {e.joint}
                </text>
              </g>
            );
          })}

          {/* 节点 */}
          {Object.values(positions).map(({ c, x, y }) => (
            <Node key={c.id} c={c} x={x} y={y} suggestion={view.suggestions[c.id] ?? ""} />
          ))}
        </svg>
      </div>

      {view.edges.length === 0 && (
        <p className="hint">当前版本暂无可绘制的榫卯关系边。</p>
      )}
    </section>
  );
}

function Node({
  c,
  x,
  y,
  suggestion,
}: {
  c: Component;
  x: number;
  y: number;
  suggestion: string;
}) {
  const danger = suggestion.includes("贯穿裂缝") || suggestion.includes("严重");
  const replacement = !!c.releasedFrom;
  return (
    <g>
      <rect
        x={x - 52}
        y={y - 20}
        width="104"
        height="40"
        rx="7"
        fill={replacement ? "#f0fdf4" : "#fffdf7"}
        stroke={danger ? "#b91c1c" : replacement ? "#16a34a" : "#854d0e"}
        strokeWidth={danger ? 2.4 : 1.4}
        strokeDasharray={replacement ? "6 3" : undefined}
      />
      <text x={x} y={y - 4} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#172033">
        {c.id}
      </text>
      <text x={x} y={y + 10} textAnchor="middle" fontSize="8.5" fill="#64748b">
        {c.role}·{c.joint}
        {replacement ? "·替代件" : ""}
      </text>
    </g>
  );
}

function Legend() {
  return (
    <div className="legend">
      <span><i className="lg lg-normal" />正常</span>
      <span><i className="lg lg-watch" />关注</span>
      <span><i className="lg lg-danger" />危险</span>
      <span><i className="lg lg-repl" />替代件</span>
    </div>
  );
}
