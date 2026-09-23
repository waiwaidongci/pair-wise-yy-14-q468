// 业务文件一：构件台账
// 负责建筑、在役构件、备用构件、病害记录的台账数据，以及由台账派生的
// 修缮建议与单栋建筑构件关系边（纯函数，保证刷新 / 回看旧版时结果一致）。

export type JointType = "燕尾榫" | "透榫" | "半榫" | "箍头榫";
export type MemberRole = "梁" | "柱" | "枋" | "檩" | "斗拱";
export type DiseaseKind =
  | "端部开裂"
  | "贯穿裂缝"
  | "糟朽"
  | "变形"
  | "虫蛀"
  | "含水率异常";
export type Severity = "轻微" | "中等" | "严重";
export type DiseaseSource = "测绘" | "补录" | "补测";

export interface DiseaseRecord {
  id: string;
  kind: DiseaseKind;
  severity: Severity;
  position: string;
  note: string;
  date: string;
  source: DiseaseSource;
}

export interface Component {
  id: string; // 构件编号
  buildingId: string; // 所属建筑；备用件在库时为 STOCK
  stock: boolean; // 是否为备用构件
  wood: string; // 木材种类
  joint: JointType; // 榫卯类型
  section: string; // 截面尺寸
  role: MemberRole;
  bay: string; // 开间分组，关系图同组内连边
  moisture: number | null; // 含水率(%)，缺失为 null
  deformation: string; // 变形情况
  diseases: DiseaseRecord[];
  replacedBy: string | null; // 原构件：被哪件备用件替代
  releasedFrom: string | null; // 备用件：放行后替代了哪个原构件
  updatedAt: string;
}

export interface Building {
  id: string;
  name: string;
}

export type EdgeHealth = "正常" | "关注" | "危险";

export interface RelationEdge {
  id: string;
  bay: string;
  from: string;
  to: string;
  joint: JointType;
  health: EdgeHealth;
}

export const JOINT_TYPES: JointType[] = ["燕尾榫", "透榫", "半榫", "箍头榫"];
export const MEMBER_ROLES: MemberRole[] = ["梁", "柱", "枋", "檩", "斗拱"];
export const DISEASE_KINDS: DiseaseKind[] = [
  "端部开裂",
  "贯穿裂缝",
  "糟朽",
  "变形",
  "虫蛀",
  "含水率异常",
];
export const SEVERITIES: Severity[] = ["轻微", "中等", "严重"];
export const WOOD_SPECIES = ["楠木", "松木", "柏木", "樟木"];

export const STOCK_ID = "STOCK";

let diseaseSeq = 0;
export function newDiseaseId(): string {
  diseaseSeq += 1;
  return `DIS-${Date.now().toString(36)}-${diseaseSeq}`;
}

export function hasThroughCrack(c: Component): boolean {
  return c.diseases.some((d) => d.kind === "贯穿裂缝");
}

/** 替代件匹配三要素：木种、截面、榫型须完全一致 */
export function sameSpec(a: Component, b: Component): boolean {
  return a.wood === b.wood && a.section === b.section && a.joint === b.joint;
}

/** 在役成员：归属该建筑、且未被替代的构件（含已放行入场的替代件） */
export function buildingMembers(
  components: Component[],
  buildingId: string
): Component[] {
  return components.filter(
    (c) => c.buildingId === buildingId && !c.replacedBy
  );
}

/** 被替代下线的原构件 */
export function replacedMembers(
  components: Component[],
  buildingId: string
): Component[] {
  return components.filter(
    (c) => c.buildingId === buildingId && !!c.replacedBy
  );
}

/** 备用件台账：在库空闲 + 已放行占用（带占用来源批次信息） */
export function stockItems(components: Component[]): Component[] {
  return components.filter((c) => c.stock);
}

/** 修缮建议：由含水率、病害、变形按优先级唯一派生，贯穿裂缝只能走替代件 */
export function deriveSuggestion(c: Component): string {
  if (c.replacedBy) {
    return `已由替代件 ${c.replacedBy} 放行更换，原构件下线封存`;
  }
  if (hasThroughCrack(c)) {
    return "贯穿裂缝贯穿断面、禁止继续受力：仅可申请同木种、同截面、同榫型的替代构件放行";
  }
  if (c.diseases.some((d) => d.severity === "严重")) {
    return "病害已达严重等级，建议整体更换或墩接加固后复验";
  }
  if (c.moisture !== null && c.moisture > 18) {
    return "含水率超标，先做烘干处理并复测，合格后方可施工";
  }
  if (c.diseases.some((d) => d.kind === "含水率异常")) {
    return "含水率异常，布设监测点持续观测并安排复测";
  }
  if (c.diseases.some((d) => d.kind === "糟朽")) {
    return "糟朽部位剔补防腐，柱脚建议局部墩接";
  }
  if (c.diseases.some((d) => d.kind === "虫蛀")) {
    return "熏蒸杀虫、防腐处理，复查蛀蚀深度后再定级";
  }
  if (
    /明显|严重/.test(c.deformation) ||
    c.diseases.some((d) => d.kind === "变形" && d.severity !== "轻微")
  ) {
    return "卸载支顶、校正变形，稳定后继续监测";
  }
  if (c.diseases.some((d) => d.kind === "端部开裂")) {
    return "端部裂缝嵌补加箍，列入定期观测";
  }
  if (c.diseases.length > 0 || /倾斜|走闪/.test(c.deformation)) {
    return "病害轻微，不影响受力，继续监测";
  }
  return "状态完好，按常规保养";
}

function memberHealth(c: Component): EdgeHealth {
  if (
    hasThroughCrack(c) ||
    c.diseases.some((d) => d.severity === "严重") ||
    /明显|严重/.test(c.deformation)
  ) {
    return "危险";
  }
  if (
    c.diseases.some((d) => d.severity === "中等") ||
    (c.moisture !== null && c.moisture > 18) ||
    /倾斜|走闪/.test(c.deformation)
  ) {
    return "关注";
  }
  return "正常";
}

function worse(a: EdgeHealth, b: EdgeHealth): EdgeHealth {
  if (a === "危险" || b === "危险") return "危险";
  if (a === "关注" || b === "关注") return "关注";
  return "正常";
}

/** 同一开间内，按构造角色成对连边；替代件入场后继承原构件角色与开间 */
const ROLE_PAIRS: ReadonlyArray<[MemberRole, MemberRole]> = [
  ["檩", "梁"],
  ["梁", "柱"],
  ["枋", "柱"],
  ["斗拱", "梁"],
];

export function deriveEdges(members: Component[]): RelationEdge[] {
  const edges: RelationEdge[] = [];
  const bays = Array.from(new Set(members.map((m) => m.bay)));
  for (const bay of bays) {
    const group = members.filter((m) => m.bay === bay);
    for (const [roleA, roleB] of ROLE_PAIRS) {
      const listA = group.filter((m) => m.role === roleA);
      const listB = group.filter((m) => m.role === roleB);
      for (const a of listA) {
        for (const b of listB) {
          edges.push({
            id: `${bay}:${a.id}--${b.id}`,
            bay,
            from: a.id,
            to: b.id,
            joint: a.joint,
            health: worse(memberHealth(a), memberHealth(b)),
          });
        }
      }
    }
  }
  return edges;
}

export function suggestionMap(
  members: Component[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of members) out[m.id] = deriveSuggestion(m);
  return out;
}

// ---------------------------------------------------------------------------
// 种子台账数据
// ---------------------------------------------------------------------------

export const seedBuildings: Building[] = [
  { id: "DBD", name: "大悲殿" },
  { id: "LHT", name: "罗汉堂" },
];

function disease(
  id: string,
  kind: DiseaseKind,
  severity: Severity,
  position: string,
  note: string,
  date: string,
  source: DiseaseSource = "测绘"
): DiseaseRecord {
  return { id, kind, severity, position, note, date, source };
}

export function seedComponents(): Component[] {
  const mk = (
    id: string,
    buildingId: string,
    wood: string,
    joint: JointType,
    section: string,
    role: MemberRole,
    bay: string,
    moisture: number | null,
    deformation: string,
    diseases: DiseaseRecord[],
    stock = false
  ): Component => ({
    id,
    buildingId,
    stock,
    wood,
    joint,
    section,
    role,
    bay,
    moisture,
    deformation,
    diseases,
    replacedBy: null,
    releasedFrom: null,
    updatedAt: "2026-09-16",
  });

  return [
    // —— 大悲殿：封样后尚未开工，含缺含水率 / 缺病害记录构件 ——
    mk(
      "DBD-L01",
      "DBD",
      "楠木",
      "燕尾榫",
      "200x260mm",
      "梁",
      "明间",
      14.2,
      "无明显变形",
      [disease("DBD-L01-D1", "端部开裂", "中等", "东端梁肩", "梁肩顺纹裂缝长约120mm", "2026-09-15")]
    ),
    mk(
      "DBD-Z01",
      "DBD",
      "楠木",
      "透榫",
      "300x300mm",
      "柱",
      "明间",
      null,
      "柱脚轻微内倾",
      [] // 缺病害记录（也缺含水率），开工后只能补录
    ),
    mk(
      "DBD-F01",
      "DBD",
      "松木",
      "半榫",
      "160x220mm",
      "枋",
      "明间",
      15.8,
      "无明显变形",
      [disease("DBD-F01-D1", "端部开裂", "轻微", "西端榫头", "浅表细纹，未贯通", "2026-09-15")]
    ),
    mk(
      "DBD-T01",
      "DBD",
      "柏木",
      "燕尾榫",
      "直径220mm",
      "檩",
      "明间",
      16.4,
      "轻微下挠",
      [disease("DBD-T01-D1", "虫蛀", "中等", "檩身下侧", "见虫道与新鲜蛀粉", "2026-09-15")]
    ),
    mk(
      "DBD-DG1",
      "DBD",
      "楠木",
      "箍头榫",
      "120x160mm",
      "斗拱",
      "明间",
      12.9,
      "轻微走闪",
      [disease("DBD-DG1-D1", "变形", "轻微", "坐斗处", "栌斗偏移约3mm", "2026-09-15")]
    ),

    // —— 罗汉堂：已封样开工，梁架通裂，已有替代件放行 ——
    mk(
      "LHT-L01",
      "LHT",
      "松木",
      "燕尾榫",
      "180x240mm",
      "梁",
      "明间",
      16.1,
      "梁身明显下垂",
      [disease("LHT-L01-D1", "贯穿裂缝", "严重", "梁身通长", "底面贯通裂缝长约2.6m，宽4mm", "2026-09-17")]
    ),
    mk(
      "LHT-Z01",
      "LHT",
      "柏木",
      "透榫",
      "280x280mm",
      "柱",
      "明间",
      13.7,
      "无明显变形",
      [disease("LHT-Z01-D1", "糟朽", "中等", "柱脚东南侧", "柱脚糟朽深约20mm", "2026-09-17")]
    ),
    mk(
      "LHT-F01",
      "LHT",
      "松木",
      "半榫",
      "150x200mm",
      "枋",
      "明间",
      19.2,
      "无明显变形",
      [disease("LHT-F01-D1", "含水率异常", "中等", "枋身中段", "复测含水率19.2%", "2026-09-17")]
    ),
    mk(
      "LHT-T01",
      "LHT",
      "楠木",
      "燕尾榫",
      "直径200mm",
      "檩",
      "明间",
      14.0,
      "无明显变形",
      [disease("LHT-T01-D1", "端部开裂", "轻微", "北端头", "发丝纹一条", "2026-09-17")]
    ),

    // —— 备用构件库 ——
    mk("SP-01", STOCK_ID, "松木", "燕尾榫", "180x240mm", "梁", "明间", 12.6, "备用新件，无变形", [], true),
    mk("SP-02", STOCK_ID, "楠木", "透榫", "300x300mm", "柱", "明间", 13.1, "备用新件，无变形", [], true),
    mk("SP-03", STOCK_ID, "松木", "半榫", "150x200mm", "枋", "明间", 12.8, "备用新件，无变形", [], true),
    mk("SP-04", STOCK_ID, "松木", "燕尾榫", "200x260mm", "梁", "明间", 13.5, "备用新件，无变形", [], true),
  ];
}
