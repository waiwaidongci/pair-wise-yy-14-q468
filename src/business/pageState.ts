// 业务文件三：页面状态
// 负责：整页唯一数据源（reducer）、localStorage 持久化（刷新后清单/关系图/批次状态一致）、
// 初始演示数据与页面选择状态。批次流转纯规则见 batchRules.ts，台账见 componentLedger.ts。

import { useCallback, useEffect, useMemo, useReducer } from "react";
import {
  BUILDINGS,
  COMPONENTS,
  STOCK,
  TenonType,
} from "./componentLedger";
import {
  RuleOutput,
  RulesState,
  SurveyBatch,
  buildVersion,
} from "./batchRules";

const STORAGE_KEY = "survey-station-state-v1";

export interface PageNotice {
  id: number;
  kind: "info" | "success" | "error";
  text: string;
}

export interface PageState {
  data: RulesState;
  notices: PageNotice[];
  selectedBuildingId: string;
  tenonFilter: TenonType | "全部";
  /** 每栋建筑关系图正在查看的版本号（默认当前版本） */
  viewedVersionByBatch: Record<string, number>;
  noticeSeq: number;
}

type Action =
  | { type: "rule"; run: (data: RulesState) => RuleOutput }
  | { type: "selectBuilding"; buildingId: string }
  | { type: "setFilter"; filter: TenonType | "全部" }
  | { type: "viewVersion"; batchId: string; version: number }
  | { type: "dismissNotice"; id: number }
  | { type: "resetDemo" };

export function makeSeed(): RulesState {
  const data: RulesState = {
    buildings: structuredClone(BUILDINGS),
    components: structuredClone(COMPONENTS),
    stock: structuredClone(STOCK),
    batches: [],
    orders: [],
    seq: 2,
  };

  const seal = (
    buildingId: string,
    id: string,
    surveyor: string,
    sealedAt: string,
    startedAt: string | null
  ): SurveyBatch => ({
    id,
    buildingId,
    status: startedAt ? "active" : "sealed",
    sealedAt,
    sealedBy: surveyor,
    startedAt,
    versions: [
      buildVersion(
        data,
        data.buildings.find((item) => item.id === buildingId)!,
        1,
        sealedAt,
        surveyor
      ),
    ],
    resurvey: null,
  });

  data.batches.push(
    seal("B-GYG", "PC-GYG-01", "周慎", "2026-09-12 09:20:00", "2026-09-13 08:30:00"),
    seal("B-DXD", "PC-DXD-01", "周慎", "2026-09-20 14:05:00", null),
    seal("B-LHT", "PC-LHT-01", "梁思年", "2026-09-15 10:40:00", "2026-09-16 08:00:00")
  );

  data.orders.push(
    {
      id: "R-0001",
      batchId: "PC-GYG-01",
      buildingId: "B-GYG",
      sourceComponentId: "GYG-L01",
      stockId: "P-1001",
      status: "released",
      createdAt: "2026-09-16 11:02:00",
      createdBy: "周慎",
      releasedAt: "2026-09-16 15:40:00",
      releasedBy: "林觉",
      returnReason: null,
    },
    {
      id: "R-0002",
      batchId: "PC-LHT-01",
      buildingId: "B-LHT",
      sourceComponentId: "LHT-L01",
      stockId: "P-2001",
      status: "pending",
      createdAt: "2026-09-21 16:18:00",
      createdBy: "梁思年",
      releasedAt: null,
      releasedBy: null,
      returnReason: null,
    }
  );

  return data;
}

function initialPageState(): PageState {
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PageState;
        if (parsed.data && Array.isArray(parsed.data.batches)) return parsed;
      }
    } catch {
      // 损坏的存档回落到演示数据
    }
  }
  return {
    data: makeSeed(),
    notices: [],
    selectedBuildingId: "B-GYG",
    tenonFilter: "全部",
    viewedVersionByBatch: {},
    noticeSeq: 0,
  };
}

function reducer(state: PageState, action: Action): PageState {
  switch (action.type) {
    case "rule": {
      const output = action.run(state.data);
      // 规则函数始终返回新状态；即使被拦截（未改数据）也统一替换，保证引用一致
      return {
        ...state,
        data: output.state,
        noticeSeq: state.noticeSeq + 1,
        notices: [
          ...state.notices,
          { id: state.noticeSeq + 1, kind: output.notice.kind, text: output.notice.text },
        ].slice(-4),
      };
    }
    case "selectBuilding":
      return { ...state, selectedBuildingId: action.buildingId };
    case "setFilter":
      return { ...state, tenonFilter: action.filter };
    case "viewVersion":
      return {
        ...state,
        viewedVersionByBatch: {
          ...state.viewedVersionByBatch,
          [action.batchId]: action.version,
        },
      };
    case "dismissNotice":
      return { ...state, notices: state.notices.filter((n) => n.id !== action.id) };
    case "resetDemo":
      return {
        data: makeSeed(),
        notices: [
          {
            id: state.noticeSeq + 1,
            kind: "info",
            text: "已恢复演示数据（清单、关系图、批次状态一并重置）。",
          },
        ],
        noticeSeq: state.noticeSeq + 1,
        selectedBuildingId: "B-GYG",
        tenonFilter: "全部",
        viewedVersionByBatch: {},
      };
    default:
      return state;
  }
}

export function useSurveyStation() {
  const [state, dispatch] = useReducer(reducer, undefined, initialPageState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储失败不影响当前操作
    }
  }, [state]);

  // 通知 5 秒后自动消失
  useEffect(() => {
    if (state.notices.length === 0) return;
    const timers = state.notices.map((notice) =>
      window.setTimeout(() => dispatch({ type: "dismissNotice", id: notice.id }), 5200)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [state.notices]);

  const runRule = useCallback(
    (run: (data: RulesState) => RuleOutput) => dispatch({ type: "rule", run }),
    []
  );

  const selectedBuilding = useMemo(
    () => state.data.buildings.find((b) => b.id === state.selectedBuildingId) ?? state.data.buildings[0],
    [state.data.buildings, state.selectedBuildingId]
  );

  return {
    state,
    runRule,
    selectedBuilding,
    selectBuilding: (buildingId: string) =>
      dispatch({ type: "selectBuilding", buildingId }),
    setFilter: (filter: TenonType | "全部") =>
      dispatch({ type: "setFilter", filter }),
    viewVersion: (batchId: string, version: number) =>
      dispatch({ type: "viewVersion", batchId, version }),
    dismissNotice: (id: number) => dispatch({ type: "dismissNotice", id }),
    resetDemo: () => dispatch({ type: "resetDemo" }),
  };
}
