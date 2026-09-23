import { Component, deriveEdges, RelationEdge, suggestionMap } from "./ledger";
import { BatchSnapshot, ReadingDraft, SurveyBatch } from "./batchRules";

export interface BuildingView {
  batch: SurveyBatch | undefined;
  activeMembers: Component[]; // 在役（含已放行替代件）
  replaced: Component[]; // 下线原构件
  edges: RelationEdge[];
  suggestions: Record<string, string>;
  snapshot: BatchSnapshot | null; // 非 null 时为只读旧版
  frozen: boolean; // 补测冻结
  draftsByComponent: Record<string, ReadingDraft>;
}

/**
 * 清单、关系图、批次状态共用同一份派生结果：
 * - 旧版回看：读快照中的关系边 / 建议
 * - 补测冻结：当前图取冻结值，草案值仅在补测台预览
 * - 平时：由台账实时派生
 */
export function selectBuildingView(
  components: Component[],
  batches: SurveyBatch[],
  buildingId: string,
  viewVersion: number | null
): BuildingView {
  const batch = batches.find((b) => b.buildingId === buildingId);
  const allOfBuilding = components.filter((c) => c.buildingId === buildingId);
  const activeMembers = allOfBuilding.filter((c) => !c.replacedBy);
  const replaced = allOfBuilding.filter((c) => c.replacedBy);

  const snapshot =
    batch && viewVersion !== null
      ? batch.snapshots.find((s) => s.version === viewVersion) ?? null
      : null;

  const frozen = batch?.status === "补测冻结";
  const freezeSnap =
    batch && frozen
      ? [...batch.snapshots].reverse().find((s) => s.type === "补测旧版") ?? null
      : null;

  const draftsByComponent: Record<string, ReadingDraft> = {};
  if (batch?.resurvey) {
    for (const d of batch.resurvey.drafts) draftsByComponent[d.componentId] = d;
  }

  if (snapshot) {
    return {
      batch,
      activeMembers,
      replaced,
      edges: snapshot.edges,
      suggestions: snapshot.suggestions,
      snapshot,
      frozen: false,
      draftsByComponent,
    };
  }

  if (frozen && freezeSnap) {
    return {
      batch,
      activeMembers,
      replaced,
      edges: freezeSnap.edges,
      suggestions: freezeSnap.suggestions,
      snapshot: null,
      frozen: true,
      draftsByComponent,
    };
  }

  return {
    batch,
    activeMembers,
    replaced,
    edges: deriveEdges(activeMembers),
    suggestions: suggestionMap(activeMembers),
    snapshot: null,
    frozen: false,
    draftsByComponent,
  };
}
