// 业务文件一：构件台账
// 负责：建筑 / 构件 / 病害 / 备用构件的台账类型、初始数据与台账级查询。
// 批次流转规则见 batchRules.ts，页面状态见 pageState.tsx。

export const TENON_TYPES = ["燕尾榫", "透榫", "半榫", "箍头榫"] as const;
export type TenonType = (typeof TENON_TYPES)[number];

/** 开工后锁定的三个字段（木种、编号、截面） */
export const LOCKED_FIELDS = ["woodSpecies", "id", "section"] as const;

export interface DiseaseRecord {
  id: string;
  /** 病害类型，如 贯穿裂缝 / 柱脚糟朽 / 拱瓣开裂 */
  type: string;
  /** 病害位置 */
  position: string;
}

export interface ComponentRecord {
  /** 构件编号（封样开工后锁定） */
  id: string;
  buildingId: string;
  /** 构件名称，如 三架梁 */
  name: string;
  /** 木材种类（开工后锁定） */
  woodSpecies: string;
  /** 榫卯类型 */
  tenonType: TenonType;
  /** 截面尺寸（开工后锁定） */
  section: string;
  /** 含水率(%)，null 表示未记录，开工后仅可补录 */
  moisture: number | null;
  /** 变形情况 */
  deformation: string;
  /** 病害记录，空数组表示未记录，开工后仅可补录 */
  diseases: DiseaseRecord[];
}

export interface StructuralLink {
  from: string;
  to: string;
  tenon: TenonType;
}

export interface Building {
  id: string;
  name: string;
  note: string;
  /** 结构关系骨架：补测重算关系边时以此为底图 */
  links: StructuralLink[];
}

export interface StockComponent {
  id: string;
  name: string;
  woodSpecies: string;
  tenonType: TenonType;
  section: string;
  remark: string;
}

export interface SpecLike {
  woodSpecies: string;
  tenonType: TenonType;
  section: string;
}

/* ------------------------------ 台账查询 ------------------------------ */

/** 贯穿裂缝判定：只有贯穿裂缝才允许走替代件流程 */
export function hasThroughCrack(component: ComponentRecord): boolean {
  return component.diseases.some((disease) => disease.type.includes("贯穿裂缝"));
}

export function missingMoisture(component: ComponentRecord): boolean {
  return component.moisture === null;
}

export function missingDisease(component: ComponentRecord): boolean {
  return component.diseases.length === 0;
}

/** 木种 / 截面 / 榫型 三项是否一致，返回不一致项的中文说明 */
export function specMismatch(stock: SpecLike, component: SpecLike): string[] {
  const reasons: string[] = [];
  if (stock.woodSpecies !== component.woodSpecies) {
    reasons.push(`木种不一致（替代件 ${stock.woodSpecies} / 原件 ${component.woodSpecies}）`);
  }
  if (stock.section !== component.section) {
    reasons.push(`截面不一致（替代件 ${stock.section} / 原件 ${component.section}）`);
  }
  if (stock.tenonType !== component.tenonType) {
    reasons.push(`榫型不一致（替代件 ${stock.tenonType} / 原件 ${component.tenonType}）`);
  }
  return reasons;
}

export function componentsOfBuilding(
  components: ComponentRecord[],
  buildingId: string
): ComponentRecord[] {
  return components.filter((component) => component.buildingId === buildingId);
}

/* ------------------------------ 初始台账 ------------------------------ */

export const BUILDINGS: Building[] = [
  {
    id: "B-GYG",
    name: "观音阁",
    note: "明代抬梁式木构 · 已开工批次",
    links: [
      { from: "GYG-Z01", to: "GYG-L01", tenon: "箍头榫" },
      { from: "GYG-L01", to: "GYG-D01", tenon: "透榫" },
    ],
  },
  {
    id: "B-DXD",
    name: "大雄宝殿",
    note: "清式梁架 · 已封样待开工（演示锁定与补录）",
    links: [
      { from: "DXD-Z01", to: "DXD-L01", tenon: "箍头榫" },
      { from: "DXD-L01", to: "DXD-D01", tenon: "燕尾榫" },
    ],
  },
  {
    id: "B-LHT",
    name: "罗汉堂",
    note: "山门配殿 · 替代件待放行",
    links: [{ from: "LHT-Z01", to: "LHT-L01", tenon: "透榫" }],
  },
];

export const COMPONENTS: ComponentRecord[] = [
  // 观音阁（开工中）
  {
    id: "GYG-Z01",
    buildingId: "B-GYG",
    name: "东金柱",
    woodSpecies: "楠木",
    tenonType: "箍头榫",
    section: "Φ300 圆作",
    moisture: 12.4,
    deformation: "无明显变形",
    diseases: [{ id: "D-001", type: "柱脚糟朽", position: "东侧柱脚" }],
  },
  {
    id: "GYG-L01",
    buildingId: "B-GYG",
    name: "三架梁",
    woodSpecies: "樟木",
    tenonType: "透榫",
    section: "180×240mm",
    moisture: 14.9,
    deformation: "挠度轻微",
    diseases: [{ id: "D-002", type: "贯穿裂缝", position: "西端梁头" }],
  },
  {
    id: "GYG-D01",
    buildingId: "B-GYG",
    name: "柱头斗拱",
    woodSpecies: "榆木",
    tenonType: "半榫",
    section: "120×160mm",
    moisture: 11.8,
    deformation: "斗耳轻微歪斜",
    diseases: [],
  },
  // 大雄宝殿（封样未开工：含水率 / 病害有缺项）
  {
    id: "DXD-Z01",
    buildingId: "B-DXD",
    name: "前檐柱",
    woodSpecies: "楠木",
    tenonType: "箍头榫",
    section: "Φ300 圆作",
    moisture: null,
    deformation: "",
    diseases: [],
  },
  {
    id: "DXD-L01",
    buildingId: "B-DXD",
    name: "五架梁",
    woodSpecies: "杉木",
    tenonType: "燕尾榫",
    section: "200×260mm",
    moisture: 16.1,
    deformation: "跨中下挠明显",
    diseases: [{ id: "D-003", type: "贯穿裂缝", position: "跨中北侧" }],
  },
  {
    id: "DXD-D01",
    buildingId: "B-DXD",
    name: "平身科斗拱",
    woodSpecies: "榆木",
    tenonType: "半榫",
    section: "120×160mm",
    moisture: 13.0,
    deformation: "",
    diseases: [{ id: "D-004", type: "拱瓣开裂", position: "南向斗拱" }],
  },
  // 罗汉堂
  {
    id: "LHT-Z01",
    buildingId: "B-LHT",
    name: "内柱",
    woodSpecies: "柏木",
    tenonType: "透榫",
    section: "240×240mm",
    moisture: 13.6,
    deformation: "无明显变形",
    diseases: [{ id: "D-005", type: "表面糟朽", position: "柱根" }],
  },
  {
    id: "LHT-L01",
    buildingId: "B-LHT",
    name: "四椽栿",
    woodSpecies: "杉木",
    tenonType: "燕尾榫",
    section: "200×260mm",
    moisture: 15.5,
    deformation: "栿身轻微侧弯",
    diseases: [{ id: "D-006", type: "贯穿裂缝", position: "栿身东侧" }],
  },
];

export const STOCK: StockComponent[] = [
  {
    id: "P-1001",
    name: "备用三架梁",
    woodSpecies: "樟木",
    tenonType: "透榫",
    section: "180×240mm",
    remark: "观音阁替代备料",
  },
  {
    id: "P-1002",
    name: "备用斗拱",
    woodSpecies: "榆木",
    tenonType: "半榫",
    section: "120×160mm",
    remark: "库房 A 架",
  },
  {
    id: "P-2001",
    name: "备用五架梁",
    woodSpecies: "杉木",
    tenonType: "燕尾榫",
    section: "200×260mm",
    remark: "南料场干燥料",
  },
  {
    id: "P-2002",
    name: "演练梁料",
    woodSpecies: "松木",
    tenonType: "燕尾榫",
    section: "200×260mm",
    remark: "木种不符，用于演练整单退回",
  },
  {
    id: "P-2003",
    name: "备用五架梁（复检合格）",
    woodSpecies: "杉木",
    tenonType: "燕尾榫",
    section: "200×260mm",
    remark: "复检合格，可放行",
  },
  {
    id: "P-3001",
    name: "演练柱料",
    woodSpecies: "楠木",
    tenonType: "半榫",
    section: "Φ300 圆作",
    remark: "榫型不符，用于演练整单退回",
  },
];
