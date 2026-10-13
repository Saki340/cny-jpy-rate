// Bundles the petal-elements components this site uses into
// public/vendor/petal.js (one ES module, no build step on the site itself).
//
//   node tools/build-petal.mjs [path-to-petal-elements]
//
// The path defaults to ../petal-elements (a sibling checkout). Run
// `npm run build` there first: the bundle is made from its compiled .js.
// The npm release (0.1.0) does not have all the components yet, which is why
// the bundle is built from the repository.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { writeFileSync, statSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const petal = path.resolve(process.argv[2] || path.join(root, "..", "petal-elements"));
const esbuild = createRequire(path.join(petal, "package.json"))("esbuild");

// Only what the page uses; add a line here when the page needs another one.
const components = [
  "appbar/top-app-bar.js",
  "button/filled-button.js",
  "button/filled-tonal-button.js",
  "button/text-button.js",
  "buttongroup/button-group.js",
  "card/filled-card.js",
  "chips/assist-chip.js",
  "dialog/dialog.js",
  "divider/divider.js",
  "icon/icon.js",
  "iconbutton/icon-button.js",
  "list/list.js",
  "list/list-item.js",
  "loadingindicator/loading-indicator.js",
  "menu/menu.js",
  "menu/menu-group.js",
  "menu/menu-item.js",
  "progress/linear-progress.js",
  "pulltorefresh/pull-to-refresh.js",
  "snackbar/snackbar.js",
  "textfield/outlined-text-field.js",
  "tooltip/tooltip.js",
];

const result = await esbuild.build({
  stdin: {
    contents: components.map((c) => `import ${JSON.stringify(path.join(petal, c).replaceAll("\\", "/"))};`).join("\n"),
    resolveDir: petal,
  },
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "none",
  write: false,
  nodePaths: [path.join(petal, "node_modules")],
});
const out = path.join(root, "public", "vendor", "petal.js");
writeFileSync(out, result.outputFiles[0].contents);
console.log(`${path.relative(root, out)}: ${(statSync(out).size / 1024).toFixed(1)} KB, ${components.length} components`);
