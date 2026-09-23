// 业务文件二：批次规则
// 纯规则模块：勘测批次封样、开工锁定、缺项补录、贯穿裂缝替代件放行、
// 补测冻结与换人两次确认重算。所有函数不可变地返回新状态，由页面状态层调用。

import {
  Component,
  DiseaseKind,
  DiseaseRecord,
  DiseaseSource,
  Severity,
  deriveEdges,
  deriveSuggestion,
  hasThroughCrack,
  newDiseaseId,
  sameSpec,
  suggestionMap,
} from "./ledger";

export type BatchStatus = "已封样" | "已开工" | "补测冻结";

export interface SupplementEntry {
  id: string;
  componentId: string;
  field: "含水率" | "病害记录";
  value: string;
  recordedBy: string;
  date: string;
}

export interface ReplacementLine {
  sourceId: string; // 申请替代的原构件
  stockId: string; // 拟占用的备用件
}

export interface ReplacementOrder {
  id: string;
  batchId: string;
  lines: ReplacementLine[];
  status: "已放行" | "已退回";
  reason: string;
  applicant: string;
  date: string;
}

/** 补测草案：只允许改含水率、病害、变形（木种 / 编号 / 截面开工即锁定） */
export interface ReadingDraft {
  componentId: string;
  moisture: number | null;
  deformation: string;
  diseases: DiseaseRecord[];
}

/** 旧版快照：重算 / 补录冻结时的只读留档 */
export interface BatchSnapshot {
  version: number;
  type: "封样基线" | "补测旧版";
  date: string;
  surveyor: string;
  readingBy: Record<string, ReadingDraft>;
  edges: ReturnType<typeof deriveEdges>;
  suggestions: Record<string, string>;
  note: string;
}

export interface ResurveySession {
  startedAt: string;
  drafts: ReadingDraft[];
  draftsTouched: boolean;
  oldSurveyor: string;
  newSurveyor: string;
  confirmStep: 0 | 1 | 2;
}

export interface SurveyBatch {
  id: string;
  buildingId: string;
  status: BatchStatus;
  sealedAt: string;
  sealedBy: string; // 封样测绘人（首封留档，永不改变）
  currentSurveyor: string; // 当前测绘人，补测换人后更新
  componentIds: string[];
  supplements: SupplementEntry[];
  orders: ReplacementOrder[];
  snapshots: BatchSnapshot[];
  resurvey: ResurveySession | null;
  timeline: string[];
}

export interface RuleResult {
  components: Component[];
  batches: SurveyBatch[];
  ok: boolean;
  message: string;
  tone: "success" | "error" | "info";
}

let ruleSeq = 0;
function nextId(prefix: string): string {
  ruleSeq += 1;
  return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(
    ruleSeq
  ).padStart(2, "0")}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function membersOf(components: Component[], batch: SurveyBatch): Component[] {
  // 在役成员 = 归属本建筑且未下线的构件（含已放行入场的替代件）
  return components.filter(
    (c) => c.buildingId === batch.buildingId && !c.replacedBy
  );
}

function batchByBuilding(
  batches: SurveyBatch[],
  buildingId: string
): SurveyBatch | undefined {
  return batches.find((b) => b.buildingId === buildingId);
}

function snapshot(
  version: number,
  type: BatchSnapshot["type"],
  date: string,
  surveyor: string,
  members: Component[],
  note: string
): BatchSnapshot {
  return {
    version,
    type,
    date,
    surveyor,
    readingBy: Object.fromEntries(
      members.map((m) => [
        m.id,
        {
          componentId: m.id,
          moisture: m.moisture,
          deformation: m.deformation,
          diseases: clone(m.diseases),
        },
      ])
    ),
    edges: deriveEdges(members),
    suggestions: suggestionMap(members),
    note,
  };
}

// ---------------------------------------------------------------------------
// 规则 1：每栋建筑只留一个封样批次；重复发起沿用首次
// ---------------------------------------------------------------------------

export function sealBatch(
  components: Component[],
  batches: SurveyBatch[],
  buildingId: string,
  sealedBy: string
): RuleResult {
  const existing = batchByBuilding(batches, buildingId);
  if (existing) {
    // 沿用首次封样，不新建、不覆盖
    return {
      components,
      batches,
      ok: true,
      tone: "info",
      message: `该建筑已封样（批次 ${existing.id}，封样人 ${existing.sealedBy}），重复发起沿用首次封样，不另立批次。`,
    };
  }

  const sealed = components
    .filter((c) => c.buildingId === buildingId && !c.stock && !c.replacedBy)
    .map((c) => c.id);
  const now = new Date().toISOString().slice(0, 10);
  const id = nextId("FY");
  const batch: SurveyBatch = {
    id,
    buildingId,
    status: "已封样",
    sealedAt: now,
    sealedBy: sealedBy.trim() || "未署名测绘员",
    currentSurveyor: sealedBy.trim() || "未署名测绘员",
    componentIds: sealed,
    supplements: [],
    orders: [],
    snapshots: [],
    resurvey: null,
    timeline: [`${now} 封样批次 ${id} 建立，纳入 ${sealed.length} 件构件（封样人：${sealedBy.trim() || "未署名测绘员"}）`],
  };
  return {
    components,
    batches: [...batches, batch],
    ok: true,
    tone: "success",
    message: `封样批次 ${id} 已建立，每栋建筑仅保留一个封样批次。`,
  };
}

// ---------------------------------------------------------------------------
// 规则 2：开工锁定木种、编号、截面；缺含水率或病害记录只能补录
// ---------------------------------------------------------------------------

export function startBatch(
  components: Component[],
  batches: SurveyBatch[],
  buildingId: string
): RuleResult {
  const batch = batchByBuilding(batches, buildingId);
  if (!batch) {
    return fail(components, batches, "请先完成封样，封样批次建立后才能开工。");
  }
  if (batch.status !== "已封样") {
    return fail(
      components,
      batches,
      `批次当前为「${batch.status}」，不能重复开工。`
    );
  }

  const members = membersOf(components, batch);
  const missing: string[] = [];
  for (const m of members) {
    if (!m.wood.trim() || !m.id.trim() || !m.section.trim()) {
      missing.push(`${m.id} 的木种 / 编号 / 截面不完整`);
    }
  }
  if (missing.length) {
    return fail(
      components,
      batches,
      "开工被阻断：" + missing.join("；") + "。请补齐后再申请开工。"
    );
  }

  const next = clone(batches);
  const target = next.find((b) => b.id === batch.id)!;
  const now = new Date().toISOString().slice(0, 10);
  const base = snapshot(
    1,
    "封样基线",
    now,
    target.sealedBy,
    members,
    "开工封样基线：木种、编号、截面自此锁定"
  );
  target.snapshots = [base];
  target.status = "已开工";
  target.timeline = [
    ...target.timeline,
    `${now} 批次开工：木种、构件编号、截面尺寸正式锁定；缺含水率或病害记录只能走补录。`,
  ];

  const noMoisture = members.filter((m) => m.moisture === null).map((m) => m.id);
  const noDisease = members.filter((m) => m.diseases.length === 0).map((m) => m.id);
  const gaps: string[] = [];
  if (noMoisture.length) gaps.push(`缺含水率：${noMoisture.join("、")}`);
  if (noDisease.length) gaps.push(`缺病害记录：${noDisease.join("、")}`);
  const message =
    `批次 ${target.id} 已开工，木种 / 编号 / 截面已锁定。` +
    (gaps.length ? ` 以下缺项只能补录，不能回填测绘记录：${gaps.join("；")}。` : " 台账无缺项。");

  return { components, batches: next, ok: true, tone: "success", message };
}

export interface SupplementInput {
  componentId: string;
  kind: "含水率" | "病害记录";
  moisture?: number;
  disease?: {
    kind: DiseaseKind;
    severity: Severity;
    position: string;
    note: string;
  };
  recordedBy: string;
}

export function addSupplement(
  components: Component[],
  batches: SurveyBatch[],
  buildingId: string,
  input: SupplementInput
): RuleResult {
  const batch = batchByBuilding(batches, buildingId);
  if (!batch) return fail(components, batches, "尚未封样，无法补录。");
  if (batch.status === "补测冻结") {
    return fail(components, batches, "批次正在补测冻结中，关系边与修缮建议已冻结，补测完成前不可补录。");
  }
  if (batch.status !== "已开工") {
    return fail(components, batches, "缺含水率或病害记录只能在开工后补录；测绘阶段请直接编辑台账。");
  }
  const member = components.find((c) => c.id === input.componentId);
  if (!member || !batch.componentIds.includes(member.id)) {
    return fail(components, batches, "构件不在本封样批次内。");
  }
  const by = input.recordedBy.trim() || "未署名记录员";
  const now = new Date().toISOString().slice(0, 10);
  const nextComponents = clone(components);
  const target = nextComponents.find((c) => c.id === member.id)!;

  let valueText = "";
  if (input.kind === "含水率") {
    if (typeof input.moisture !== "number" || Number.isNaN(input.moisture)) {
      return fail(components, batches, "补录含水率必须填写数值。");
    }
    // 已有含水率属重测，不属于补录
    if (member.moisture !== null) {
      return fail(
        components,
        batches,
        `${member.id} 已有含水率 ${member.moisture}%，补录仅用于缺项；要修改既有数值请发起补测。`
      );
    }
    target.moisture = input.moisture;
    valueText = `含水率 ${input.moisture}%`;
  } else {
    if (!input.disease || !input.disease.position.trim()) {
      return fail(components, batches, "补录病害需选择病害类型并填写位置。");
    }
    const rec: DiseaseRecord = {
      id: newDiseaseId(),
      kind: input.disease.kind,
      severity: input.disease.severity,
      position: input.disease.position.trim(),
      note: input.disease.note.trim(),
      date: now,
      source: "补录" as DiseaseSource,
    };
    target.diseases = [...target.diseases, rec];
    valueText = `${rec.kind}（${rec.severity}）@${rec.position}`;
  }
  target.updatedAt = now;

  const nextBatches = clone(batches);
  const b = nextBatches.find((x) => x.id === batch.id)!;
  const entry: SupplementEntry = {
    id: `BL-${Date.now().toString(36)}`,
    componentId: member.id,
    field: input.kind,
    value: valueText,
    recordedBy: by,
    date: now,
  };
  b.supplements = [...b.supplements, entry];
  b.timeline = [
    ...b.timeline,
    `${now} 补录${input.kind}：${member.id} → ${valueText}（记录人：${by}）。补录完成即恢复实时计算。`,
  ];

  return {
    components: nextComponents,
    batches: nextBatches,
    ok: true,
    tone: "success",
    message: `已补录 ${member.id} 的${input.kind}：${valueText}。`,
  };
}

// ---------------------------------------------------------------------------
// 规则 3：贯穿裂缝只能申请替代件；三要素一致且未被占用，否则整单退回不留占用
// ---------------------------------------------------------------------------

export interface OrderIssue {
  sourceId: string;
  stockId: string;
  reason: string;
}

export function validateReplacementOrder(
  components: Component[],
  batch: SurveyBatch,
  lines: ReplacementLine[]
): OrderIssue[] {
  const issues: OrderIssue[] = [];
  const seenStock = new Set<string>();

  for (const line of lines) {
    const source = components.find((c) => c.id === line.sourceId);
    const stock = components.find((c) => c.id === line.stockId);

    if (!source || !batch.componentIds.includes(source.id)) {
      issues.push({ ...line, reason: "原构件不在本封样批次内" });
      continue;
    }
    if (source.replacedBy) {
      issues.push({ ...line, reason: `${source.id} 已由 ${source.replacedBy} 替代放行，不能重复申请` });
      continue;
    }
    if (!hasThroughCrack(source)) {
      issues.push({
        ...line,
        reason: `${source.id} 无贯穿裂缝，只能按修缮建议处理，不得申请替代件`,
      });
      continue;
    }
    if (!stock || !stock.stock) {
      issues.push({ ...line, reason: "未选择库内备用构件" });
      continue;
    }
    if (seenStock.has(stock.id)) {
      issues.push({ ...line, reason: `${stock.id} 在本单内重复选用` });
      continue;
    }
    seenStock.add(stock.id);
    if (stock.buildingId !== "STOCK") {
      issues.push({
        ...line,
        reason: `${stock.id} 已被其他批次占用（已放行至 ${stock.buildingId}）`,
      });
      continue;
    }
    if (!sameSpec(source, stock)) {
      issues.push({
        ...line,
        reason: `三要素不一致：${source.id}（${source.wood}/${source.section}/${source.joint}）vs ${stock.id}（${stock.wood}/${stock.section}/${stock.joint}）`,
      });
    }
  }
  return issues;
}

export function submitReplacementOrder(
  components: Component[],
  batches: SurveyBatch[],
  buildingId: string,
  lines: ReplacementLine[],
  applicant: string
): RuleResult {
  const batch = batchByBuilding(batches, buildingId);
  if (!batch) return fail(components, batches, "尚未封样，无法提交替代件放行单。");
  if (batch.status !== "已开工") {
    return fail(
      components,
      batches,
      `批次「${batch.status}」期间不受理替代件放行，请在已开工状态申请。`
    );
  }
  if (lines.length === 0) {
    return fail(components, batches, "放行单至少包含一条替代申请。");
  }

  const issues = validateReplacementOrder(components, batch, lines);
  const id = nextId("FX");
  const now = new Date().toISOString().slice(0, 10);
  const person = applicant.trim() || "未署名申请人";

  const nextBatches = clone(batches);
  const b = nextBatches.find((x) => x.id === batch.id)!;

  // 任一申请行不合规 → 整单退回，不占用任何备用件
  if (issues.length) {
    const order: ReplacementOrder = {
      id,
      batchId: batch.id,
      lines: clone(lines),
      status: "已退回",
      reason: issues.map((i) => `${i.sourceId}→${i.stockId}：${i.reason}`).join("；"),
      applicant: person,
      date: now,
    };
    b.orders = [...b.orders, order];
    b.timeline = [
      ...b.timeline,
      `${now} 放行单 ${id} 含 ${lines.length} 条申请、${issues.length} 条不合规，整单退回，未占用任何备用件。`,
    ];
    return {
      components,
      batches: nextBatches,
      ok: false,
      tone: "error",
      message: `放行单 ${id} 整单退回：${order.reason}。未产生占用，可修正后重新申请。`,
    };
  }

  // 全部合规 → 一次性提交：占用备用件、原构件下线
  const nextComponents = clone(components);
  for (const line of lines) {
    const source = nextComponents.find((c) => c.id === line.sourceId)!;
    const stock = nextComponents.find((c) => c.id === line.stockId)!;
    source.replacedBy = stock.id;
    source.updatedAt = now;
    stock.buildingId = buildingId;
    stock.releasedFrom = source.id;
    stock.bay = source.bay;
    stock.role = source.role;
    stock.updatedAt = now;
  }
  const detail = lines
    .map((l) => `${l.sourceId} → ${l.stockId}`)
    .join("、");
  const order: ReplacementOrder = {
    id,
    batchId: batch.id,
    lines: clone(lines),
    status: "已放行",
    reason: `木种、截面、榫型一致，备用件在库未占用。替代关系：${detail}`,
    applicant: person,
    date: now,
  };
  b.orders = [...b.orders, order];
  b.timeline = [
    ...b.timeline,
    `${now} 放行单 ${id} 核准：${detail}（申请人：${person}）；备用件占用入册，原构件下线，关系图按新成员重绘。`,
  ];

  return {
    components: nextComponents,
    batches: nextBatches,
    ok: true,
    tone: "success",
    message: `放行单 ${id} 已核准：${detail}。备用件已占用，关系图即时重算。`,
  };
}

// ---------------------------------------------------------------------------
// 规则 4：补测冻结原批关系边和修缮建议；换人两次确认后按新值重算，旧版只读
// ---------------------------------------------------------------------------

export function startResurvey(
  components: Component[],
  batches: SurveyBatch[],
  buildingId: string
): RuleResult {
  const batch = batchByBuilding(batches, buildingId);
  if (!batch) return fail(components, batches, "尚未封样，无法补测。");
  if (batch.status !== "已开工") {
    return fail(components, batches, `批次「${batch.status}」，只有已开工批次可发起补测。`);
  }
  const members = membersOf(components, batch);
  const now = new Date().toISOString().slice(0, 10);

  const nextBatches = clone(batches);
  const b = nextBatches.find((x) => x.id === batch.id)!;
  const oldVersion = b.snapshots.length + 1;
  b.snapshots = [
    ...b.snapshots,
    snapshot(oldVersion, "补测旧版", now, b.currentSurveyor, members, "补测发起时冻结：旧版关系边与修缮建议只读留档"),
  ];
  b.resurvey = {
    startedAt: now,
    oldSurveyor: b.currentSurveyor,
    newSurveyor: "",
    confirmStep: 0,
    draftsTouched: false,
    drafts: members.map((m) => ({
      componentId: m.id,
      moisture: m.moisture,
      deformation: m.deformation,
      diseases: clone(m.diseases),
    })),
  };
  b.status = "补测冻结";
  b.timeline = [
    ...b.timeline,
    `${now} 发起补测：原批关系边与修缮建议冻结为旧版 v${oldVersion}（只读），须换人并经两次确认后按新值重算。`,
  ];
  return {
    components,
    batches: nextBatches,
    ok: true,
    tone: "info",
    message: `补测已发起，旧版 v${oldVersion} 冻结为只读；请由非「${b.currentSurveyor}」的测绘员录入新读数。`,
  };
}

export function updateResurveyDraft(
  components: Component[],
  batches: SurveyBatch[],
  buildingId: string,
  componentId: string,
  patch: { moisture?: number | null; deformation?: string }
): RuleResult {
  const batch = batchByBuilding(batches, buildingId);
  if (!batch || !batch.resurvey) return fail(components, batches, "当前没有进行中的补测。");
  const nextBatches = clone(batches);
  const b = nextBatches.find((x) => x.id === batch.id)!;
  const draft = b.resurvey!.drafts.find((d) => d.componentId === componentId);
  if (!draft) return fail(components, batches, "构件不在补测范围内。");
  if (patch.moisture !== undefined) draft.moisture = patch.moisture;
  if (patch.deformation !== undefined) draft.deformation = patch.deformation;
  b.resurvey!.draftsTouched = true;
  // 改读数后需要重新走换人 + 两次确认
  b.resurvey!.confirmStep = 0;
  return { components, batches: nextBatches, ok: true, tone: "info", message: "新读数已暂存于补测草案，待换人两次确认。" };
}

export function setResurveySurveyor(
  components: Component[],
  batches: SurveyBatch[],
  buildingId: string,
  name: string
): RuleResult {
  const batch = batchByBuilding(batches, buildingId);
  if (!batch || !batch.resurvey) return fail(components, batches, "当前没有进行中的补测。");
  const nextBatches = clone(batches);
  const b = nextBatches.find((x) => x.id === batch.id)!;
  b.resurvey!.newSurveyor = name;
  b.resurvey!.confirmStep = 0;
  if (!name.trim()) {
    return { components, batches: nextBatches, ok: false, tone: "info", message: "请填写换人测绘员姓名。" };
  }
  if (name.trim() === b.resurvey!.oldSurveyor) {
    return {
      components,
      batches: nextBatches,
      ok: false,
      tone: "error",
      message: `换人确认不通过：补测须由原测绘人「${b.resurvey!.oldSurveyor}」以外的人员执行。`,
    };
  }
  return {
    components,
    batches: nextBatches,
    ok: true,
    tone: "info",
    message: `换人登记为「${name.trim()}」，与原测绘人不同，可进行两次确认。`,
  };
}

export function confirmResurvey(
  components: Component[],
  batches: SurveyBatch[],
  buildingId: string
): RuleResult {
  const batch = batchByBuilding(batches, buildingId);
  if (!batch || !batch.resurvey) return fail(components, batches, "当前没有进行中的补测。");
  const rs = batch.resurvey;
  if (!rs.newSurveyor.trim() || rs.newSurveyor.trim() === rs.oldSurveyor) {
    return fail(components, batches, "须先登记与原测绘人不同的换人测绘员。");
  }
  if (!rs.draftsTouched) {
    return fail(components, batches, "补测草案尚无任何新读数，请至少修改一项含水率、变形或病害。");
  }

  const nextBatches = clone(batches);
  const b = nextBatches.find((x) => x.id === batch.id)!;
  const step = b.resurvey!.confirmStep;

  if (step === 0) {
    b.resurvey!.confirmStep = 1;
    return {
      components,
      batches: nextBatches,
      ok: true,
      tone: "info",
      message: "第一次确认完成：新值将覆盖补测读数并解冻关系边，请第二次确认执行重算。",
    };
  }

  // 第二次确认：按新值重算
  const nextComponents = clone(components);
  const now = new Date().toISOString().slice(0, 10);
  for (const draft of b.resurvey!.drafts) {
    const c = nextComponents.find((x) => x.id === draft.componentId);
    if (!c) continue;
    c.moisture = draft.moisture;
    c.deformation = draft.deformation;
    c.diseases = clone(draft.diseases);
    c.updatedAt = now;
  }

  const newMembers = membersOf(nextComponents, b);
  const newVersion = b.snapshots.length + 1;
  const snap = snapshot(
    newVersion,
    "封样基线",
    now,
    b.resurvey!.newSurveyor.trim(),
    newMembers,
    `补测重算 v${newVersion}：换人 ${b.resurvey!.oldSurveyor} → ${b.resurvey!.newSurveyor.trim()}，两次确认通过`
  );
  // 新值同样形成基线快照供后续回看；旧版保持“补测旧版”只读
  b.snapshots = [...b.snapshots, snap];
  b.currentSurveyor = b.resurvey!.newSurveyor.trim();
  b.timeline = [
    ...b.timeline,
    `${now} 换人 ${rs.oldSurveyor} → ${b.currentSurveyor} 两次确认通过，按补测新值重算关系边与修缮建议（v${newVersion}）；旧版只读保留。`,
  ];
  b.status = "已开工";
  b.resurvey = null;

  return {
    components: nextComponents,
    batches: nextBatches,
    ok: true,
    tone: "success",
    message: `两次确认完成，补测新值生效（v${newVersion}）：关系边与修缮建议已按新值重算，旧版冻结只读。`,
  };
}

export function cancelResurvey(
  components: Component[],
  batches: SurveyBatch[],
  buildingId: string
): RuleResult {
  const batch = batchByBuilding(batches, buildingId);
  if (!batch || !batch.resurvey) return fail(components, batches, "当前没有进行中的补测。");
  const nextBatches = clone(batches);
  const b = nextBatches.find((x) => x.id === batch.id)!;
  const dropped = b.snapshots[b.snapshots.length - 1];
  b.snapshots = b.snapshots.filter((s) => s !== dropped);
  b.resurvey = null;
  b.status = "已开工";
  b.timeline = [...b.timeline, `${new Date().toISOString().slice(0, 10)} 放弃补测，草案作废，冻结解除，恢复原批实时计算。`];
  return { components, batches: nextBatches, ok: true, tone: "info", message: "已放弃补测，草案作废，批次恢复已开工。" };
}

/** 补测草案中新增病害（重算后才能成为正式病害） */
export function draftAddDisease(
  components: Component[],
  batches: SurveyBatch[],
  buildingId: string,
  componentId: string,
  d: DiseaseRecord
): RuleResult {
  const batch = batchByBuilding(batches, buildingId);
  if (!batch || !batch.resurvey) return fail(components, batches, "当前没有进行中的补测。");
  const nextBatches = clone(batches);
  const b = nextBatches.find((x) => x.id === batch.id)!;
  const draft = b.resurvey!.drafts.find((x) => x.componentId === componentId);
  if (!draft) return fail(components, batches, "构件不在补测范围内。");
  draft.diseases = [...draft.diseases, { ...d, id: newDiseaseId(), source: "补测" }];
  b.resurvey!.draftsTouched = true;
  b.resurvey!.confirmStep = 0;
  return { components, batches: nextBatches, ok: true, tone: "info", message: "病害已加入补测草案，两次确认后生效。" };
}

/** 补测草案中移除病害（复测后病害已消除时核销，两次确认后随新值生效） */
export function draftRemoveDisease(
  components: Component[],
  batches: SurveyBatch[],
  buildingId: string,
  componentId: string,
  diseaseId: string
): RuleResult {
  const batch = batchByBuilding(batches, buildingId);
  if (!batch || !batch.resurvey) return fail(components, batches, "当前没有进行中的补测。");
  const nextBatches = clone(batches);
  const b = nextBatches.find((x) => x.id === batch.id)!;
  const draft = b.resurvey!.drafts.find((x) => x.componentId === componentId);
  if (!draft) return fail(components, batches, "构件不在补测范围内。");
  if (!draft.diseases.some((d) => d.id === diseaseId)) {
    return fail(components, batches, "草案中没有该病害记录。");
  }
  draft.diseases = draft.diseases.filter((d) => d.id !== diseaseId);
  b.resurvey!.draftsTouched = true;
  b.resurvey!.confirmStep = 0;
  return { components, batches: nextBatches, ok: true, tone: "info", message: "病害已从补测草案核销，两次确认后随新值生效。" };
}

/** 预览补测草案重算后的建议与关系边（不落库） */
export function previewResurvey(
  components: Component[],
  batch: SurveyBatch
): {
  edges: ReturnType<typeof deriveEdges>;
  suggestions: Record<string, string>;
} {
  if (!batch.resurvey) {
    const members = membersOf(components, batch);
    return { edges: deriveEdges(members), suggestions: suggestionMap(members) };
  }
  const draftMap = new Map(batch.resurvey.drafts.map((d) => [d.componentId, d]));
  const members: Component[] = membersOf(components, batch).map((m) => {
    const d = draftMap.get(m.id);
    return d
      ? { ...m, moisture: d.moisture, deformation: d.deformation, diseases: d.diseases }
      : m;
  });
  return { edges: deriveEdges(members), suggestions: suggestionMap(members) };
}

export function currentSuggestionFor(c: Component): string {
  return deriveSuggestion(c);
}

function fail(
  components: Component[],
  batches: SurveyBatch[],
  message: string
): RuleResult {
  return { components, batches, ok: false, tone: "error", message };
}
