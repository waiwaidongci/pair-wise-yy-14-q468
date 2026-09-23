import { makeSeed } from "../src/business/pageState";
import {
  sealBatch,
  startWork,
  updateWorkingComponent,
  supplementMoisture,
  supplementDisease,
  createReplacementOrder,
  releaseOrder,
  startResurvey,
  updateResurveyDraft,
  submitResurvey,
  commitResurvey,
  getBatch,
  currentVersion,
  occupantOf,
} from "../src/business/batchRules";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

// 1. 封样唯一性：大雄宝殿已有封样批次，重复发起沿用首次
let s = makeSeed();
const before = s.batches.length;
const r1 = sealBatch(s, "B-DXD", "新人");
check("重复封样被拦截且提示沿用", r1.notice.kind === "info" && r1.notice.text.includes("沿用"));
check("重复封样不新增批次", s.batches.length === before);

// 未封样建筑（用删除批次模拟）
s.batches = s.batches.filter((b) => b.buildingId !== "B-LHT");
const r2 = sealBatch(s, "B-LHT", "梁思年");
s = r2.state;
check("无批次时封样成功", r2.ok);
check("封样首版 v1", currentVersion(getBatch(s, "B-LHT")!).version === 1);
const r3 = sealBatch(s, "B-LHT", "另一个人");
check("再次封样沿用首次", r3.notice.kind === "info" && getBatch(s, "B-LHT")!.sealedBy === "梁思年");

// 2. 开工锁定
s = makeSeed();
const dxd = getBatch(s, "B-DXD")!;
const lockEdit = updateWorkingComponent(s, dxd.id, "DXD-L01", {
  woodSpecies: "松木",
});
check("开工前其实可改——此批未开工应允许", lockEdit.ok);
const started = startWork(s, dxd.id);
s = started.state;
check("开工成功", started.ok && getBatch(s, "B-DXD")!.status === "active");
const lockedWood = updateWorkingComponent(s, dxd.id, "DXD-L01", {
  woodSpecies: "松木",
});
check("开工后木种锁定拒绝", !lockedWood.ok);
const lockedSection = updateWorkingComponent(s, dxd.id, "DXD-L01", {
  section: "999x999",
});
check("开工后截面锁定拒绝", !lockedSection.ok);
const deform = updateWorkingComponent(s, dxd.id, "DXD-L01", {
  deformation: "挠度加大",
});
check("开工后变形仍可改", deform.ok);

// 缺含水率 / 病害只能补录
const dupMoisture = supplementMoisture(s, dxd.id, "DXD-L01", 10);
check("已有含水率不能改录", !dupMoisture.ok);
const fillMoisture = supplementMoisture(s, dxd.id, "DXD-Z01", 12.3);
s = fillMoisture.state;
check("缺失含水率可补录", fillMoisture.ok);
const fillMoistureAgain = supplementMoisture(s, dxd.id, "DXD-Z01", 13.3);
check("补录后不可再改", !fillMoistureAgain.ok);
const fillDisease = supplementDisease(s, dxd.id, "DXD-Z01", {
  type: "柱脚糟朽",
  position: "西脚",
});
s = fillDisease.state;
check("缺失病害可补录", fillDisease.ok);
const fillDiseaseAgain = supplementDisease(s, dxd.id, "DXD-Z01", {
  type: "表面糟朽",
  position: "东脚",
});
check("病害补录后不可再录", !fillDiseaseAgain.ok);

// 3. 替代件
// 3a. 非贯穿裂缝不能申请（DXD-Z01 补录的是糟朽）
const nonThrough = createReplacementOrder(s, dxd.id, "DXD-Z01", "P-3001", "甲");
check("非贯穿裂缝禁止替代", !nonThrough.ok);

// 3b. 木种不符（P-2002 松木 vs DXD-L01 杉木）→ 整单退回不留占用
const mismatch = createReplacementOrder(s, dxd.id, "DXD-L01", "P-2002", "甲");
s = mismatch.state;
check("木种不符整单退回", !mismatch.ok);
const mismatchOrder = s.orders.find((o) => o.sourceComponentId === "DXD-L01")!;
check("退回单状态为 returned", mismatchOrder.status === "returned");
check("退回单不留占用", occupantOf(s, "P-2002") === undefined);

// 3c. 榫型不符（P-3001 半榫 vs DXD-L01 燕尾榫）→ 退回
const mismatch2 = createReplacementOrder(s, dxd.id, "DXD-L01", "P-3001", "甲");
check("榫型不符整单退回", !mismatch2.ok);

// 3d. 合格且空闲（P-2003）→ 待放行
const okOrder = createReplacementOrder(s, dxd.id, "DXD-L01", "P-2003", "甲");
s = okOrder.state;
check("一致且空闲→待放行", okOrder.ok);
const pending = s.orders.filter((o) => o.status === "pending");
check("待放行单占用备料", occupantOf(s, "P-2003") !== undefined);

// 3e. 同件重复申请被拒（用 P-2003）
const dupApply = createReplacementOrder(s, dxd.id, "DXD-L01", "P-2001", "甲");
check("同原件重复申请被拒", !dupApply.ok);

// 3f. 别的批次申请同一备料 → 整单退回（罗汉堂原件 LHT-L01 杉木/燕尾榫/200×260 与 P-2003 一致；
//     种子中罗汉堂已有一张待放行单，先剔除以隔离占用冲突场景）
s.orders = s.orders.filter((o) => o.sourceComponentId !== "LHT-L01");
const lht = getBatch(s, "B-LHT")!;
const occupiedByOther = createReplacementOrder(s, lht.id, "LHT-L01", "P-2003", "乙");
s = occupiedByOther.state;
check("被其他批次占用→整单退回", !occupiedByOther.ok);
const lhtOrder = s.orders.find(
  (o) => o.sourceComponentId === "LHT-L01" && o.status === "returned"
);
check("占用冲突退回单不留占用痕迹于该备料（原待放行单仍占用）",
  lhtOrder !== undefined && occupantOf(s, "P-2003")?.sourceComponentId === "DXD-L01");

// 3g. 放行成功
const pendingId = s.orders.find((o) => o.sourceComponentId === "DXD-L01" && o.status === "pending")!.id;
const released = releaseOrder(s, pendingId, "复核员");
s = released.state;
check("放行成功", released.ok);
check("放行后备料仍占用", occupantOf(s, "P-2003")?.status === "released");

// 4. 补测：观音阁开工中
s = makeSeed();
const gyg = getBatch(s, "B-GYG")!;
const rs0 = startResurvey(s, gyg.id);
s = rs0.state;
check("发起补测冻结", rs0.ok && getBatch(s, "B-GYG")!.status === "resurveying");
const batch0 = getBatch(s, "B-GYG")!;
const frozenEdges = structuredClone(currentVersion(batch0).edges);

// 冻结期间普通补录被拒
const frozenSupp = supplementMoisture(s, gyg.id, "GYG-D01", 9);
check("冻结期间补录必须走补测工单", !frozenSupp.ok);

// 改新值
const up = updateResurveyDraft(s, gyg.id, "GYG-D01", {
  deformation: "斗耳歪斜加剧",
  diseases: [{ id: "D-N1", type: "拱瓣开裂", position: "东向拱瓣" }],
});
s = up.state;
// 同一测绘员第一次确认拒绝
const sameGuy = submitResurvey(s, gyg.id, "周慎");
check("换人不能是原批测绘员", !sameGuy.ok);
const first = submitResurvey(s, gyg.id, "林觉");
s = first.state;
check("第一次确认进入 step1", first.ok && getBatch(s, "B-GYG")!.resurvey!.step === 1);
// 改值后回到第一步
const up2 = updateResurveyDraft(s, gyg.id, "GYG-D01", { deformation: "再次校正" });
s = up2.state;
check("改新值后确认状态回退", getBatch(s, "B-GYG")!.resurvey!.step === 0);
submitResurvey(s, gyg.id, "林觉");
s = submitResurvey(s, gyg.id, "林觉").state;
const second = commitResurvey(s, gyg.id);
s = second.state;
check("第二次确认重算生成 v2", second.ok && currentVersion(getBatch(s, "B-GYG")!).version === 2);
check("旧版 v1 保留只读", getBatch(s, "B-GYG")!.versions[0].version === 1);
check("旧版关系边未被修改", JSON.stringify(getBatch(s, "B-GYG")!.versions[0].edges) === JSON.stringify(frozenEdges));
const v2 = currentVersion(getBatch(s, "B-GYG")!);
const d01v2 = v2.components.find((c) => c.componentId === "GYG-D01")!;
check("v2 采用新值", d01v2.deformation === "再次校正" && d01v2.diseases.some((d) => d.type === "拱瓣开裂"));
check("重算后批次回到开工中", getBatch(s, "B-GYG")!.status === "active");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
