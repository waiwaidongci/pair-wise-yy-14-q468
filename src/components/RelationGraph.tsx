import {
  BatchVersion,
  EdgeHealth,
} from "../business/batchRules";
import { StructuralLink } from "../business/componentLedger";
import { Badge, Empty, Panel } from "./ui";

const NODE_W = 132;
const NODE_H = 64;
const COL_GAP = 72;
const ROW_GAP = 46;
const PAD = 26;

/** 按建筑骨架在画布上排成分层 DAG */
function layout(links: StructuralLink[], nodeIds: string[]) {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const id of nodeIds) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }
  for (const link of links) {
    outgoing.get(link.from)?.push(link.to);
    incoming.get(link.to)?.push(link.from);
  }

  const depth = new Map<string, number>();
  const roots = nodeIds.filter((id) => (incoming.get(id)?.length ?? 0) === 0);
  const walk = (id: string, level: number) => {
    depth.set(id, Math.max(depth.get(id) ?? 0, level));
    for (const next of outgoing.get(id) ?? []) walk(next, level + 1);
  };
  for (const root of roots) walk(root, 0);
  for (const id of nodeIds) if (!depth.has(id)) depth.set(id, 0);

  const columns = new Map<number, string[]>();
  for (const id of nodeIds) {
    const level = depth.get(id) ?? 0;
    columns.set(level, [...(columns.get(level) ?? []), id]);
  }
  const maxRows = Math.max(1, ...[...columns.values()].map((list) => list.length));
  const width =
    PAD * 2 + columns.size * NODE_W + (columns.size - 1) * COL_GAP;
  const height = PAD * 2 + maxRows * NODE_H + (maxRows - 1) * ROW_GAP;

  const positions = new Map<string, { x: number; y: number }>();
  for (const [level, list] of columns) {
    const x = PAD + level * (NODE_W + COL_GAP);
    list.forEach((id, row) => {
      const y = PAD + row * (NODE_H + ROW_GAP);
      positions.set(id, { x, y });
    });
  }
  return { positions, width, height };
}

const EDGE_COLOR: Record<EdgeHealth, string> = {
  健康: "#0f766e",
  变形关注: "#b45309",
  病害预警: "#b91c1c",
};

export function RelationGraph({
  buildingName,
  version,
  links,
  isOld,
  frozen,
}: {
  buildingName: string;
  version: BatchVersion | null;
  links: StructuralLink[];
  isOld: boolean;
  frozen: boolean;
}) {
  if (!version) {
    return (
      <Panel title="构件关系视图" subtitle={`${buildingName} · 封样后生成`}>
        <Empty text="封样后将固化首版关系视图（节点状态与关系边随版本冻结）" />
      </Panel>
    );
  }

  const nodeIds = version.components.map((item) => item.componentId);
  const { positions, width, height } = layout(links, nodeIds);

  return (
    <Panel
      title="构件关系视图"
      subtitle={`${buildingName} · 查看版本 v${version.version}（${version.surveyor} · ${version.sealedAt}）`}
      actions={
        isOld ? <Badge>旧版只读</Badge> : frozen ? <Badge>补测冻结</Badge> : undefined
      }
    >
      <div className="graph-scroll">
        <svg width={width} height={height} className="relation-svg">
          {version.edges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const midX = (x1 + x2) / 2;
            return (
              <g key={`${edge.from}-${edge.to}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={EDGE_COLOR[edge.health]}
                  strokeWidth={edge.health === "健康" ? 2 : 3}
                  strokeDasharray={edge.health === "变形关注" ? "6 4" : undefined}
                  markerEnd={`url(#arrow-${edge.health})`}
                />
                <text x={midX} y={y1 - 6} className="edge-label">
                  {edge.tenon} · {edge.health}
                </text>
              </g>
            );
          })}
          <defs>
            {(Object.keys(EDGE_COLOR) as EdgeHealth[]).map((health) => (
              <marker
                key={health}
                id={`arrow-${health}`}
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L9,3 z" fill={EDGE_COLOR[health]} />
              </marker>
            ))}
          </defs>
          {version.components.map((node) => {
            const pos = positions.get(node.componentId);
            if (!pos) return null;
            const edgeHealth = version.edges
              .filter(
                (edge) =>
                  edge.from === node.componentId || edge.to === node.componentId
              )
              .map((edge) => edge.health);
            const warn = edgeHealth.includes("病害预警")
              ? "node-danger"
              : edgeHealth.includes("变形关注")
              ? "node-warn"
              : "node-ok";
            const through = node.diseases.some((d) => d.type.includes("贯穿裂缝"));
            return (
              <g key={node.componentId} transform={`translate(${pos.x},${pos.y})`}>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx="8"
                  className={`relation-node ${warn} ${through ? "through" : ""}`}
                />
                <text x="10" y="22" className="node-title">
                  {node.code}
                </text>
                <text x="10" y="42" className="node-sub">
                  {node.name} · {node.tenonType}
                </text>
                {through ? (
                  <text x={NODE_W - 10} y="22" textAnchor="end" className="node-alert">
                    贯穿
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="edge-legend">
        <span><i className="dot dot-ok" />健康</span>
        <span><i className="dot dot-warn" />变形关注</span>
        <span><i className="dot dot-danger" />病害预警（含贯穿裂缝）</span>
      </div>

      <p className="eyebrow">关系边明细{isOld || frozen ? "（冻结只读）" : ""}</p>
      <div className="edge-details">
        {version.edges.map((edge) => (
          <article
            key={`${edge.from}-${edge.to}`}
            className={`edge-card edge-${edge.health}`}
          >
            <div className="edge-head">
              <b>{edge.from} — {edge.to}</b>
              <Badge>{edge.health}</Badge>
              <span className="muted-text">{edge.tenon}</span>
            </div>
            {edge.reasons.length ? (
              <ul className="edge-reasons">
                {edge.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p className="muted-text">两端构件暂无变形与病害记录</p>
            )}
          </article>
        ))}
      </div>
    </Panel>
  );
}
