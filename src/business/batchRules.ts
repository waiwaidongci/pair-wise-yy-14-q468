// 业务文件二：勘测批次规则
// 负责：封样批次、替代件放行单、补测版本的领域类型与流转规则（纯函数）。
// 数据台账见 componentLedger.ts，React 页面状态见 pageState.tsx。

import {
  Building,
  ComponentRecord,
  DiseaseRecord,
  StockComponent,
  StructuralLink,
  TenonType,
  hasThroughCrack,
  specMismatch,
} from "./componentLedger";

/* ------------------------------- 类型 ------------------------------- */

export interface ComponentSnapshot {
  componentId: string;
  code: string; // 构件编号（锁定项）
  name: string;
  woodSpecies: string; // 木种（锁定项）
  tenonType: TenonType;
  section: string; // 截面（锁定项）
  moisture: number | null;
  deformation: string;
  diseases: DiseaseRecord[];
}

export type EdgeHealth = "健康" | "变形关注" | "病害预警";

/** 关系边的快照视图：补测冻结/重算的最小单位 */
export interface EdgeView {
  from: string;
  to: string;
  tenon: TenonType;
  health: EdgeHealth;
  reasons: string[];
}

export interface ComponentSuggestion {
  componentId: string;
  advice: string;
}

export interface BatchVersion {
  version: number;
  sealedAt: string;
  surveyor: string;
  components: ComponentSnapshot[];
  edges: EdgeView[];
  suggestions: ComponentSuggestion[];
}

export interface EditableValues {
  moisture: number | null;
  deformation: string;
  diseases: DiseaseRecord[];
}

export interface ResurveyDraft {
  startedAt: string;
  /** 原批测绘员（重算前的当前版本测绘员） */
  previousSurveyor: string;
  /** 换人后的新测绘员，必须与原批不同 */
  surveyor: string;
  /** 0 = 待录入新值；1 = 已提交，等待第二次确认 */
  step: 0 | 1;
  submittedAt: string | null;
  componentValues: Record<string, EditableValues>;
}

export type BatchStatus = "sealed" | "active" | "resurveying";

export interface SurveyBatch {
  id: string;
  buildingId: string;
  status: BatchStatus;
  sealedAt: string;
  sealedBy: string;
  startedAt: string | null;
  /** versions[0] 为首封版本；补测重算后追加新版本，旧版只读 */
  versions: BatchVersion[];
  resurvey: ResurveyDraft | null;
}

export type OrderStatus = "pending" | "released" | "returned";

export interface ReplacementOrder {
  id: string;
  batchId: string;
  buildingId: string;
  sourceComponentId: string;
  stockId: string;
  status: OrderStatus;
  createdAt: string;
  createdBy: string;
  releasedAt: string | null;
  releasedBy: string | null;
  /** 退回原因：整单退回不留占用 */
  returnReason: string | null;
}

export interface RulesState {
  buildings: Building[];
  components: ComponentRecord[];
  stock: StockComponent[];
  batches: SurveyBatch[];
  orders: ReplacementOrder[];
  seq: number;
}

export type NoticeKind = "info" | "success" | "error";
export interface Notice {
  kind: NoticeKind;
  text: string;
}

export interface RuleOutput {
  state: RulesState;
  notice: Notice;
  ok: boolean;
}

/* --------------------------- 派生：修缮建议 --------------------------- */

export function deriveSuggestion(component: ComponentRecord): string {
  const parts: string[] = [];
  for (const disease of component.diseases) {
    if (disease.type.includes("贯穿裂缝")) {
      parts.push(`${disease.position}存在贯穿裂缝，原件不得修补，须申请木种/截面/榫型一致的替代构件`);
    } else if (disease.type.includes("糟朽") || disease.type.includes("腐朽")) {
      parts.push(`${disease.position}${disease.type}，建议局部墩接并做防腐处理`);
    } else if (disease.type.includes("开裂") || disease.type.includes("裂缝")) {
      parts.push(`${disease.position}${disease.type}，建议裂缝监测，必要时注胶加箍`);
    } else {
      parts.push(`${disease.position}${disease.type}，建议纳入病害观察点`);
    }
  }
  if (component.deformation.trim() && component.deformation !== "无明显变形") {
    parts.push(`变形情况「${component.deformation}」，建议校正并定期复测`);
  }
  return parts.length ? parts.join("；") + "。" : "继续监测。";
}

/* --------------------------- 派生：关系边状态 --------------------------- */

function componentById(state: RulesState, id: string): ComponentRecord | undefined {
  return state.components.find((component) => component.id === id);
}

export function deriveEdges(state: RulesState, links: StructuralLink[]): EdgeView[] {
  return links.map((link) => {
    const reasons: string[] = [];
    let hasDisease = false;
    for (const endpointId of [link.from, link.to]) {
      const endpoint = componentById(state, endpointId);
      if (!endpoint) {
        reasons.push(`关系边端点 ${endpointId} 不在台账中`);
        hasDisease = true;
        continue;
      }
      if (endpoint.deformation.trim() && endpoint.deformation !== "无明显变形") {
        reasons.push(`${endpoint.id} ${endpoint.deformation}`);
      }
      for (const disease of endpoint.diseases) {
        hasDisease = true;
        reasons.push(`${endpoint.id} ${disease.position}${disease.type}`);
      }
    }
    const health: EdgeHealth = hasDisease ? "病害预警" : reasons.length ? "变形关注" : "健康";
    return { ...link, health, reasons };
  });
}

/* --------------------------- 派生：版本快照 --------------------------- */

function snapshotComponents(
  components: ComponentRecord[],
  buildingId: string
): ComponentSnapshot[] {
  return components
    .filter((component) => component.buildingId === buildingId)
    .map((component) => ({
      componentId: component.id,
      code: component.id,
      name: component.name,
      woodSpecies: component.woodSpecies,
      tenonType: component.tenonType,
      section: component.section,
      moisture: component.moisture,
      deformation: component.deformation,
      diseases: structuredClone(component.diseases),
    }));
}

export function buildVersion(
  state: RulesState,
  building: Building,
  version: number,
  sealedAt: string,
  surveyor: string
): BatchVersion {
  return {
    version,
    sealedAt,
    surveyor,
    components: snapshotComponents(state.components, building.id),
    edges: deriveEdges(state, building.links),
    suggestions: state.components
      .filter((component) => component.buildingId === building.id)
      .map((component) => ({
        componentId: component.id,
        advice: deriveSuggestion(component),
      })),
  };
}

/* ------------------------------ 通用工具 ------------------------------ */

export function getBatch(state: RulesState, buildingId: string): SurveyBatch | undefined {
  return state.batches.find((batch) => batch.buildingId === buildingId);
}

export function currentVersion(batch: SurveyBatch): BatchVersion {
  return batch.versions[batch.versions.length - 1];
}

export function suggestionOf(version: BatchVersion, componentId: string): string {
  return (
    version.suggestions.find((item) => item.componentId === componentId)?.advice ??
    "继续监测。"
  );
}

/** 占用判定：待放行/已放行单均占用；退回单不占用。可排除指定单据（自身）。 */
export function occupantOf(
  state: RulesState,
  stockId: string,
  excludeOrderId?: string
): ReplacementOrder | undefined {
  return state.orders.find(
    (order) =>
      order.stockId === stockId &&
      order.status !== "returned" &&
      order.id !== excludeOrderId
  );
}

function nowText(): string {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function ok(state: RulesState, text: string): RuleOutput {
  return { state, notice: { kind: "success", text }, ok: true };
}

function info(state: RulesState, text: string): RuleOutput {
  return { state, notice: { kind: "info", text }, ok: true };
}

function fail(state: RulesState, text: string): RuleOutput {
  return { state, notice: { kind: "error", text }, ok: false };
}

function nextOrderId(state: RulesState): string {
  return `R-${String(state.seq + 1).padStart(4, "0")}`;
}

/* ------------------------------ 封样批次 ------------------------------ */

/**
 * 发起封样：每栋建筑只保留一个封样批次。
 * 重复发起不新建，直接沿用首次批次。
 */
export function sealBatch(
  prev: RulesState,
  buildingId: string,
  surveyor: string
): RuleOutput {
  const state = structuredClone(prev);
  const building = state.buildings.find((item) => item.id === buildingId);
  if (!building) return fail(state, "未找到该建筑，无法封样");
  if (!surveyor.trim()) return fail(state, "请填写封样测绘员姓名");

  const existing = getBatch(state, buildingId);
  if (existing) {
    return info(
      state,
      `「${building.name}」已存在封样批次 ${existing.id}（每栋建筑只留一个封样批次），已沿用首次批次，未重复创建。`
    );
  }

  state.seq += 1;
  const stamped = nowText();
  const id = `PC-${buildingId.replace(/^B-/, "")}-01`;
  const batch: SurveyBatch = {
    id,
    buildingId,
    status: "sealed",
    sealedAt: stamped,
    sealedBy: surveyor.trim(),
    startedAt: null,
    versions: [buildVersion(state, building, 1, stamped, surveyor.trim())],
    resurvey: null,
  };
  state.batches.push(batch);
  return ok(state, `已为「${building.name}」创建封样批次 ${id}，首封版本 v1 已生成。`);
}

/** 开工：锁定木种、编号、截面 */
export function startWork(prev: RulesState, batchId: string): RuleOutput {
  const state = structuredClone(prev);
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch) return fail(state, "批次不存在");
  if (batch.status === "active") return info(state, `批次 ${batch.id} 已开工。`);
  if (batch.status === "resurveying")
    return fail(state, "批次补测中，须先完成换人两次确认。");

  batch.status = "active";
  batch.startedAt = nowText();
  return ok(
    state,
    `批次 ${batch.id} 已开工：木种、构件编号、截面已锁定；缺含水率或病害记录的构件只能补录。`
  );
}

/* --------------------------- 工作态编辑（锁定项校验） --------------------------- */

/**
 * 工作态编辑：
 * - 封样未开工：木种 / 截面 / 变形可改（编号即台账 ID，不在表内编辑）；
 * - 已开工：木种、编号、截面锁定，仅变形可改；含水率 / 病害缺失只能走补录；
 * - 补测冻结：一切改动在补测工单内进行。
 * 改动后刷新当前工作版本快照（补测冻结期间不会调用，旧版本不受影响）。
 */
export function updateWorkingComponent(
  prev: RulesState,
  batchId: string,
  componentId: string,
  patch: Partial<Pick<ComponentRecord, "woodSpecies" | "section" | "deformation">>
): RuleOutput {
  const state = structuredClone(prev);
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch) return fail(state, "批次不存在");
  const component = state.components.find((item) => item.id === componentId);
  if (!component || component.buildingId !== batch.buildingId)
    return fail(state, "构件不属于该批次");

  if (batch.status === "resurveying")
    return fail(state, "补测冻结中：新值请在补测工单内录入，换人两次确认后随新版本生效。");

  const lockedAttempted =
    patch.woodSpecies !== undefined || patch.section !== undefined;
  if (batch.status === "active" && lockedAttempted)
    return fail(state, "批次已开工，木种、编号、截面已锁定，不能修改。");

  if (patch.woodSpecies !== undefined) {
    if (!patch.woodSpecies.trim()) return fail(state, "木种不能为空");
    component.woodSpecies = patch.woodSpecies.trim();
  }
  if (patch.section !== undefined) {
    if (!patch.section.trim()) return fail(state, "截面不能为空");
    component.section = patch.section.trim();
  }
  if (patch.deformation !== undefined) component.deformation = patch.deformation;

  const building = state.buildings.find((item) => item.id === batch.buildingId)!;
  const version = currentVersion(batch);
  const rebuilt = buildVersion(state, building, version.version, version.sealedAt, version.surveyor);
  batch.versions[batch.versions.length - 1] = rebuilt;
  return ok(
    state,
    batch.status === "sealed"
      ? `已更新 ${componentId} 的封样记录，首封版本同步刷新（开工后木种、编号、截面将锁定）。`
      : `已更新 ${componentId} 的变形记录（木种、编号、截面锁定），修缮建议已同步。`
  );
}

/** 补录 / 改值后刷新当前工作版本（供补录复用；不触碰历史版本） */
function refreshWorkingVersion(state: RulesState, batch: SurveyBatch) {
  const building = state.buildings.find((item) => item.id === batch.buildingId)!;
  const version = currentVersion(batch);
  batch.versions[batch.versions.length - 1] = buildVersion(
    state,
    building,
    version.version,
    version.sealedAt,
    version.surveyor
  );
}

/* ------------------------------ 补录 ------------------------------ */

export function supplementMoisture(
  prev: RulesState,
  batchId: string,
  componentId: string,
  moisture: number
): RuleOutput {
  const state = structuredClone(prev);
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch) return fail(state, "批次不存在");
  const component = state.components.find((item) => item.id === componentId);
  if (!component || component.buildingId !== batch.buildingId)
    return fail(state, "构件不属于该批次");
  if (batch.status === "resurveying")
    return fail(state, "补测冻结中：含水率请在补测工单内录入，换人确认后随新版本生效。");
  if (batch.status === "sealed")
    return fail(state, "批次尚未开工，字段未锁定，直接在台账中编辑即可，无需补录。");
  if (component.moisture !== null)
    return fail(state, `${componentId} 已有含水率记录（${component.moisture}%），只能补录缺失项，不能改录。`);
  if (!Number.isFinite(moisture) || moisture <= 0 || moisture > 40)
    return fail(state, "请输入合理的含水率（0–40%）");

  component.moisture = moisture;
  refreshWorkingVersion(state, batch);
  return ok(state, `已为 ${componentId} 补录含水率 ${moisture}%（开工后补录，不可再改）。`);
}

export function supplementDisease(
  prev: RulesState,
  batchId: string,
  componentId: string,
  disease: Omit<DiseaseRecord, "id">
): RuleOutput {
  const state = structuredClone(prev);
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch) return fail(state, "批次不存在");
  const component = state.components.find((item) => item.id === componentId);
  if (!component || component.buildingId !== batch.buildingId)
    return fail(state, "构件不属于该批次");
  if (batch.status === "resurveying")
    return fail(state, "补测冻结中：病害请在补测工单内录入，换人确认后随新版本生效。");
  if (batch.status === "sealed")
    return fail(state, "批次尚未开工，字段未锁定，直接在台账中编辑即可，无需补录。");
  if (component.diseases.length > 0)
    return fail(state, `${componentId} 已有病害记录，只能补录缺失项，不能改录。`);
  if (!disease.type.trim() || !disease.position.trim())
    return fail(state, "请填写病害类型与位置");

  state.seq += 1;
  component.diseases.push({
    id: `D-${String(state.seq).padStart(3, "0")}`,
    type: disease.type.trim(),
    position: disease.position.trim(),
  });
  refreshWorkingVersion(state, batch);
  return ok(state, `已为 ${componentId} 补录病害「${disease.type}」（开工后补录，不可再改）。`);
}

/* ---------------------------- 替代件放行 ---------------------------- */

/**
 * 申请替代件：
 * - 仅贯穿裂缝可申请；
 * - 木种、截面、榫型必须一致，否则整单退回（不留占用）；
 * - 被其他批次待放行/已放行单占用，整单退回（不留占用）。
 */
export function createReplacementOrder(
  prev: RulesState,
  batchId: string,
  sourceComponentId: string,
  stockId: string,
  operator: string
): RuleOutput {
  const state = structuredClone(prev);
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch) return fail(state, "批次不存在");
  if (!operator.trim()) return fail(state, "请填写申请人");
  if (batch.status !== "active")
    return fail(state, "只有开工中的批次可以申请替代件。");

  const component = state.components.find((item) => item.id === sourceComponentId);
  if (!component || component.buildingId !== batch.buildingId)
    return fail(state, "构件不属于该批次");
  if (!hasThroughCrack(component))
    return fail(state, `${sourceComponentId} 无贯穿裂缝，按规则不能申请替代件（仅贯穿裂缝可申请）。`);

  const duplicate = state.orders.find(
    (order) =>
      order.sourceComponentId === sourceComponentId && order.status !== "returned"
  );
  if (duplicate)
    return fail(
      state,
      `${sourceComponentId} 已存在替代件单 ${duplicate.id}（${duplicate.status === "released" ? "已放行" : "待放行"}），不能重复申请。`
    );

  const stock = state.stock.find((item) => item.id === stockId);
  if (!stock) return fail(state, "备用构件不存在");

  state.seq += 1;
  const id = nextOrderId(state);
  const stamp = nowText();
  const mismatches = specMismatch(stock, component);
  if (mismatches.length) {
    state.orders.push({
      id,
      batchId,
      buildingId: batch.buildingId,
      sourceComponentId,
      stockId,
      status: "returned",
      createdAt: stamp,
      createdBy: operator.trim(),
      releasedAt: null,
      releasedBy: null,
      returnReason: `整单退回：${mismatches.join("；")}。该单不留占用。`,
    });
    return fail(
      state,
      `${id} 整单退回：${mismatches.join("；")}。备用件 ${stockId} 未被占用，可重新选件申请。`
    );
  }

  const occupant = occupantOf(state, stockId);
  if (occupant) {
    state.orders.push({
      id,
      batchId,
      buildingId: batch.buildingId,
      sourceComponentId,
      stockId,
      status: "returned",
      createdAt: stamp,
      createdBy: operator.trim(),
      releasedAt: null,
      releasedBy: null,
      returnReason: `整单退回：${stockId} 已被批次 ${occupant.batchId} 的单据 ${occupant.id} 占用。该单不留占用。`,
    });
    return fail(
      state,
      `${id} 整单退回：备用件 ${stockId} 已被批次 ${occupant.batchId} 的单据 ${occupant.id} 占用。本单不留占用。`
    );
  }

  state.orders.push({
    id,
    batchId,
    buildingId: batch.buildingId,
    sourceComponentId,
    stockId,
    status: "pending",
    createdAt: stamp,
    createdBy: operator.trim(),
    releasedAt: null,
    releasedBy: null,
    returnReason: null,
  });
  return ok(
    state,
    `${id} 已提交待放行：${sourceComponentId} → ${stockId}，木种/截面/榫型一致且无占用，已临时占用待复核。`
  );
}

/** 放行：放行瞬间再次校验占用；冲突则整单退回且不留占用。 */
export function releaseOrder(
  prev: RulesState,
  orderId: string,
  operator: string
): RuleOutput {
  const state = structuredClone(prev);
  if (!operator.trim()) return fail(state, "请填写放行人");
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return fail(state, "单据不存在");
  if (order.status === "released") return info(state, `${orderId} 已放行。`);
  if (order.status === "returned") return fail(state, "退回单据不能放行。");

  const component = state.components.find((item) => item.id === order.sourceComponentId)!;
  const stock = state.stock.find((item) => item.id === order.stockId)!;
  const mismatches = specMismatch(stock, component);
  if (mismatches.length) {
    order.status = "returned";
    order.returnReason = `放行复核整单退回：${mismatches.join("；")}。不留占用。`;
    return fail(state, `${orderId} ${order.returnReason}`);
  }

  const occupant = occupantOf(state, order.stockId, order.id);
  if (occupant) {
    order.status = "returned";
    order.returnReason = `放行复核整单退回：${order.stockId} 已被批次 ${occupant.batchId} 的单据 ${occupant.id} 占用。不留占用。`;
    return fail(state, `${orderId} ${order.returnReason}`);
  }

  order.status = "released";
  order.releasedAt = nowText();
  order.releasedBy = operator.trim();
  return ok(state, `${orderId} 已放行：替代件 ${order.stockId} 正式占用，可出库替换 ${order.sourceComponentId}。`);
}

/** 人工退回待放行单：释放占用，不留痕迹占用。 */
export function returnOrder(
  prev: RulesState,
  orderId: string,
  reason: string
): RuleOutput {
  const state = structuredClone(prev);
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return fail(state, "单据不存在");
  if (order.status !== "pending") return fail(state, "仅待放行单可退回。");
  order.status = "returned";
  order.returnReason = reason.trim()
    ? `人工整单退回：${reason.trim()}。不留占用。`
    : "人工整单退回，不留占用。";
  return info(state, `${orderId} 已整单退回，备用件 ${order.stockId} 占用已释放。`);
}

/* ------------------------------ 补测 ------------------------------ */

/** 发起补测：冻结原批关系边与修缮建议（当前版本进入只读）。 */
export function startResurvey(
  prev: RulesState,
  batchId: string
): RuleOutput {
  const state = structuredClone(prev);
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch) return fail(state, "批次不存在");
  if (batch.status === "sealed") return fail(state, "批次尚未开工，不能发起补测。");
  if (batch.status === "resurveying")
    return info(state, "补测工单已存在：关系边与修缮建议处于冻结状态。");

  const previous = currentVersion(batch);
  const values: Record<string, EditableValues> = {};
  for (const component of state.components.filter(
    (item) => item.buildingId === batch.buildingId
  )) {
    values[component.id] = {
      moisture: component.moisture,
      deformation: component.deformation,
      diseases: structuredClone(component.diseases),
    };
  }
  batch.status = "resurveying";
  batch.resurvey = {
    startedAt: nowText(),
    previousSurveyor: previous.surveyor,
    surveyor: "",
    step: 0,
    submittedAt: null,
    componentValues: values,
  };
  return info(
    state,
    `批次 ${batch.id} 进入补测：原批 v${previous.version} 的关系边与修缮建议已冻结为只读，录入新值后须换人两次确认。`
  );
}

export function updateResurveyDraft(
  prev: RulesState,
  batchId: string,
  componentId: string,
  patch: Partial<EditableValues>
): RuleOutput {
  const state = structuredClone(prev);
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch || !batch.resurvey) return fail(state, "补测工单不存在");
  const values = batch.resurvey.componentValues[componentId];
  if (!values) return fail(state, "构件不属于该补测工单");
  if (patch.moisture !== undefined) values.moisture = patch.moisture;
  if (patch.deformation !== undefined) values.deformation = patch.deformation;
  if (patch.diseases !== undefined) values.diseases = structuredClone(patch.diseases);
  // 新值修改后，若已点过第一次确认，则回到待确认状态
  if (batch.resurvey.step === 1) {
    batch.resurvey.step = 0;
    batch.resurvey.submittedAt = null;
  }
  return { state, notice: { kind: "info", text: "补测新值已暂存，尚未生效（原批版本仍冻结只读）。" }, ok: true };
}

/** 第一次确认：换人提交新值 */
export function submitResurvey(
  prev: RulesState,
  batchId: string,
  newSurveyor: string
): RuleOutput {
  const state = structuredClone(prev);
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch || !batch.resurvey) return fail(state, "补测工单不存在");
  const draft = batch.resurvey;
  if (!newSurveyor.trim()) return fail(state, "请填写换班测绘员姓名");
  if (newSurveyor.trim() === draft.previousSurveyor)
    return fail(state, `换人确认无效：新测绘员不能与原批测绘员「${draft.previousSurveyor}」为同一人。`);

  draft.surveyor = newSurveyor.trim();
  draft.step = 1;
  draft.submittedAt = nowText();
  return info(
    state,
    `第一次确认完成（${draft.previousSurveyor} → ${draft.surveyor}）：新值已提交，请由确认人核对后进行第二次确认，通过即按新值重算关系边与修缮建议。`
  );
}

/** 第二次确认：按新值重算，追加新版本；旧版只读保留。 */
export function commitResurvey(
  prev: RulesState,
  batchId: string
): RuleOutput {
  const state = structuredClone(prev);
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch || !batch.resurvey) return fail(state, "补测工单不存在");
  const draft = batch.resurvey;
  if (draft.step !== 1) return fail(state, "请先换人提交新值（第一次确认），再进行第二次确认。");

  for (const component of state.components.filter(
    (item) => item.buildingId === batch.buildingId
  )) {
    const values = draft.componentValues[component.id];
    if (!values) continue;
    component.moisture = values.moisture;
    component.deformation = values.deformation;
    component.diseases = structuredClone(values.diseases);
  }

  const building = state.buildings.find((item) => item.id === batch.buildingId)!;
  const next = currentVersion(batch).version + 1;
  batch.versions.push(buildVersion(state, building, next, nowText(), draft.surveyor));
  batch.status = "active";
  batch.resurvey = null;
  return ok(
    state,
    `第二次确认通过：已按新值重算关系边与修缮建议，生成 v${next}；v1 至 v${next - 1} 旧版冻结只读。`
  );
}
