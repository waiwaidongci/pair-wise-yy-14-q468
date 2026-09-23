import { Component, DiseaseRecord } from "../business/ledger";

const SEV_COLOR: Record<string, string> = {
  轻微: "#0f766e",
  中等: "#b45309",
  严重: "#b91c1c",
};

/** 简化的构件病害标记图：木件轮廓 + 榫头，病害按位置序号落点 */
export default function DiseaseMarker({
  component,
  overrideDiseases,
}: {
  component: Component;
  overrideDiseases?: DiseaseRecord[];
}) {
  const diseases = overrideDiseases ?? component.diseases;
  const through = diseases.some((d) => d.kind === "贯穿裂缝");

  return (
    <svg className="disease-svg" viewBox="0 0 220 76" role="img" aria-label="病害标记图">
      {/* 左右榫头 */}
      <rect x="2" y="26" width="18" height="24" rx="2" fill="#d8b78a" stroke="#854d0e" />
      <rect x="200" y="26" width="18" height="24" rx="2" fill="#d8b78a" stroke="#854d0e" />
      {/* 构件主体 */}
      <rect x="18" y="14" width="184" height="48" rx="4" fill="#ead9bd" stroke="#854d0e" />
      {/* 木纹 */}
      <path d="M24 24 H196 M24 38 H196 M24 52 H196" stroke="#c8a065" strokeWidth="0.7" />

      {/* 贯穿裂缝：整长折线 */}
      {through && (
        <path
          d="M22 20 L60 56 L100 22 L140 54 L198 24"
          fill="none"
          stroke="#b91c1c"
          strokeWidth="2.4"
        />
      )}

      {diseases.map((d, i) => {
        const x = 34 + i * 30;
        const y = d.kind === "贯穿裂缝" ? 62 : i % 2 === 0 ? 24 : 52;
        return (
          <g key={d.id}>
            <circle cx={x} cy={y} r="5.5" fill={SEV_COLOR[d.severity]} stroke="#fff" strokeWidth="1.5" />
            <text x={x} y={y + 2.6} textAnchor="middle" fontSize="7" fill="#fff">
              {i + 1}
            </text>
          </g>
        );
      })}

      {diseases.length === 0 && (
        <text x="110" y="42" textAnchor="middle" fontSize="11" fill="#8a6d3b">
          无病害记录
        </text>
      )}
    </svg>
  );
}
