// 业务文件三：页面状态
// 保存批次、构件台账、批次规则的操作结果，并在 localStorage 持久化，
// 使刷新后构件清单、关系图、批次状态、旧版快照保持一致。

import {
  Component,
  DiseaseKind,
  Severity,
  seedBuildings,
  seedComponents,
  STOCK_ID,
} from "./ledger";
import {
  addSupplement,
  cancelResurvey,
  confirmResurvey,
  draftAddDisease,
  draftRemoveDisease,
  sealBatch,
  setResurveySurveyor,
  startBatch,
  startResurvey,
  submitReplacementOrder,
  updateResurveyDraft,
} from "./batchRules";
import type { ReadingDraft, ReplacementLine, RuleResult, SurveyBatch } from "./batchRules";

export interface Notice {
  id: number;
  tone: "success" | "error" | "info";
  text: string;
}

export type MainTab = "ledger" | "graph" | "release";

export interface AppState {
  buildings: typeof seedBuildings;
  components: Component[];
  batches: SurveyBatch[];
  selectedBuildingId: string;
  tab: MainTab;
  notices: Notice[];
}

export type Action =
  | { type: "selectBuilding"; buildingId: string }
  | { type: "selectTab"; tab: MainTab }
  | { type: "dismissNotice"; id: number }
  | { type: "resetDemo" }
  | { type: "seal"; sealedBy: string }
  | { type: "start" }
  | {
      type: "supplement";
      componentId: string;
      kind: "含水率" | "病害记录";
      moisture?: number;
      disease?: { kind: DiseaseKind; severity: Severity; position: string; note: string };
      recordedBy: string;
    }
  | { type: "submitOrder"; lines: ReplacementLine[]; applicant: string }
  | { type: "startResurvey" }
  | { type: "cancelResurvey" }
  | {
      type: "updateDraft";
      componentId: string;
      patch: { moisture?: number | null; deformation?: string };
    }
  | { type: "draftDisease"; componentId: string; disease: Parameters<typeof draftAddDisease>[4] }
  | { type: "draftRemoveDisease"; componentId: string; diseaseId: string }
  | { type: "setResurveyor"; name: string }
  | { type: "confirmResurvey" };

let noticeSeq = 0;
function withNotice(state: AppState, result: RuleResult): AppState {
  const notice: Notice = {
    id: ++noticeSeq,
    tone: result.tone,
    text: result.message,
  };
  return {
    ...state,
    components: result.components,
    batches: result.batches,
    notices: [...state.notices, notice].slice(-4),
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "selectBuilding":
      return { ...state, selectedBuildingId: action.buildingId };
    case "selectTab":
      return { ...state, tab: action.tab };
    case "dismissNotice":
      return { ...state, notices: state.notices.filter((n) => n.id !== action.id) };
    case "resetDemo":
      return initialState(true);
    case "seal":
      return withNotice(
        state,
        sealBatch(state.components, state.batches, state.selectedBuildingId, action.sealedBy)
      );
    case "start":
      return withNotice(
        state,
        startBatch(state.components, state.batches, state.selectedBuildingId)
      );
    case "supplement":
      return withNotice(
        state,
        addSupplement(state.components, state.batches, state.selectedBuildingId, {
          componentId: action.componentId,
          kind: action.kind,
          moisture: action.moisture,
          disease: action.disease,
          recordedBy: action.recordedBy,
        })
      );
    case "submitOrder":
      return withNotice(
        state,
        submitReplacementOrder(
          state.components,
          state.batches,
          state.selectedBuildingId,
          action.lines,
          action.applicant
        )
      );
    case "startResurvey":
      return withNotice(
        state,
        startResurvey(state.components, state.batches, state.selectedBuildingId)
      );
    case "cancelResurvey":
      return withNotice(
        state,
        cancelResurvey(state.components, state.batches, state.selectedBuildingId)
      );
    case "updateDraft":
      return withNotice(
        state,
        updateResurveyDraft(
          state.components,
          state.batches,
          state.selectedBuildingId,
          action.componentId,
          action.patch
        )
      );
    case "draftDisease":
      return withNotice(
        state,
        draftAddDisease(
          state.components,
          state.batches,
          state.selectedBuildingId,
          action.componentId,
          action.disease
        )
      );
    case "setResurveyor":
      return withNotice(
        state,
        setResurveySurveyor(
          state.components,
          state.batches,
          state.selectedBuildingId,
          action.name
        )
      );
    case "draftRemoveDisease":
      return withNotice(
        state,
        draftRemoveDisease(
          state.components,
          state.batches,
          state.selectedBuildingId,
          action.componentId,
          action.diseaseId
        )
      );
    case "confirmResurvey":
      return withNotice(
        state,
        confirmResurvey(state.components, state.batches, state.selectedBuildingId)
      );
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// 初始演示数据：大悲殿封样未开工；罗汉堂已开工且已有一单放行
// ---------------------------------------------------------------------------

export function initialState(forceFresh = false): AppState {
  if (!forceFresh) {
    const saved = loadState();
    if (saved) return saved;
  }

  let components = seedComponents();
  let batches: SurveyBatch[] = [];

  // 大悲殿：已封样，未开工（演示开工锁定与补录）
  const dbd = sealBatch(components, batches, "DBD", "周谨");
  components = dbd.components;
  batches = dbd.batches;

  // 罗汉堂：封样 → 开工 → 放行 LHT-L01 的替代件 SP-01
  const lhtSealed = sealBatch(components, batches, "LHT", "周谨");
  components = lhtSealed.components;
  batches = lhtSealed.batches;
  const lhtStarted = startBatch(components, batches, "LHT");
  components = lhtStarted.components;
  batches = lhtStarted.batches;
  const lhtOrder = submitReplacementOrder(
    components,
    batches,
    "LHT",
    [{ sourceId: "LHT-L01", stockId: "SP-01" }],
    "钱守一"
  );
  components = lhtOrder.components;
  batches = lhtOrder.batches;

  // SP-01 放行时间与台账演示日期对齐
  components = components.map((c) =>
    c.id === "SP-01" || c.id === "LHT-L01"
      ? { ...c, updatedAt: "2026-09-20" }
      : c
  );

  return {
    buildings: seedBuildings,
    components,
    batches,
    selectedBuildingId: "DBD",
    tab: "ledger",
    notices: [],
  };
}

// ---------------------------------------------------------------------------
// store：useSyncExternalStore + localStorage
// ---------------------------------------------------------------------------

const STORAGE_KEY = "hxyfront-62013-survey-batch-v1";

function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed.components || !parsed.batches) return null;
    return { ...parsed, notices: [] };
  } catch {
    return null;
  }
}

function persist(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默降级为内存态
  }
}

import { useSyncExternalStore } from "react";

let currentState: AppState = initialState(false);
const listeners = new Set<() => void>();

function emit(): void {
  persist(currentState);
  listeners.forEach((l) => l());
}

export function dispatch(action: Action): void {
  currentState = reducer(currentState, action);
  emit();
}

export function getState(): AppState {
  return currentState;
}

/**
 * 订阅整份 state 引用（仅在 dispatch 后变化），选择结果由组件自行 memo。
 * 这样既保证 useSyncExternalStore 快照稳定，又让清单、关系图、批次状态同源刷新。
 */
export function useAppState(): AppState;
export function useAppState<T>(selector: (s: AppState) => T): T;
export function useAppState<T>(selector?: (s: AppState) => T): T {
  const state = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => currentState,
    () => currentState
  );
  return (selector ? selector(state) : state) as T;
}

export type { ReadingDraft };
