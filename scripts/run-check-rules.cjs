// 用 esbuild（随 Vite 安装）把 TS 规则冒烟测试打包为 CJS 后在 Node 运行
const path = require("path");
const esbuild = require("esbuild");

const outfile = path.join(__dirname, "..", "node_modules", ".check-rules.cjs");

esbuild
  .build({
    entryPoints: [path.join(__dirname, "check-rules.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile,
  })
  .then(() => {
    require(outfile);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
