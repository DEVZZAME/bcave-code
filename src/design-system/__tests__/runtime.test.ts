import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleDesignArtifact, assembleDesignArtifactParts, lintDesignArtifact } from "../runtime.js";

function writeArtifact(source: string): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-design-"));
  const file = path.join(dir, "dashboard.html");
  fs.writeFileSync(file, assembleDesignArtifact("bcave", source, file), "utf8");
  return { dir, file };
}

describe("BCAVE design pipeline", () => {
  it("assembles structured body/app fields without code fences", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-design-parts-"));
    const file = path.join(dir, "dashboard.html");
    const html = assembleDesignArtifactParts(
      "bcave",
      '<div class="page"><div class="kpi dark"><div class="val num" id="sales"></div></div></div>',
      "document.getElementById('sales').textContent = BCAVE.fmt.krw(100);",
      file,
    );
    expect(html).toContain("BCAVE:ASSET tokens");
    expect(html).not.toContain("```html:body");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("assembles the two-block contract with marked assets and passes lint", () => {
    const { dir, file } = writeArtifact([
      "```html:body",
      '<div class="topbar"><div class="topbar-inner"><div class="logo"><!--BCAVE_SYMBOL_SVG--> B.CAVE</div></div></div>',
      '<div class="page"><div class="kpi-grid"><div class="kpi dark"><div class="lb">총매출</div><div class="val num" id="sales"></div></div></div></div>',
      "```",
      "```js:app",
      "document.getElementById('sales').textContent = BCAVE.fmt.krw(12000000);",
      "```",
    ].join("\n"));
    const html = fs.readFileSync(file, "utf8");
    expect(html).toContain("BCAVE:ASSET tokens");
    expect(html).toContain("BCAVE:ASSET chart-adapter");
    expect(html).toContain('aria-label="B.CAVE symbol"');
    expect(lintDesignArtifact("bcave", file).pass).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("detects raw Chart.js and inline style violations", () => {
    const { dir, file } = writeArtifact([
      "```html:body",
      '<div class="page" style="color:#ff0000"><canvas id="c"></canvas></div>',
      "```",
      "```js:app",
      "new Chart(document.getElementById('c'), {});",
      "```",
    ].join("\n"));
    const result = lintDesignArtifact("bcave", file);
    expect(result.pass).toBe(false);
    expect(result.violations.map((v) => v.rule)).toEqual(expect.arrayContaining(["R2-no-inline-style", "R3-alien-hex", "R5-no-raw-chart"]));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("rejects invented hero layouts and semantic chart mistakes", () => {
    const { dir, file } = writeArtifact([
      "```html:body",
      '<section class="hero"><div class="hero-copy"><h1>성과</h1></div><div class="hero-grid"><div class="kpi">잘못된 카드</div></div></section>',
      '<div class="page"><div class="kpi dark"><div class="val num" id="kpiCust"></div></div><canvas id="c"></canvas></div>',
      "```",
      "```js:app",
      "const rows = window.__DATA || [];",
      "document.getElementById('kpiCust').textContent = BCAVE.fmt.num(3) + '건';",
      "BCAVE.chart.donut(document.getElementById('c'), {labels: rows.map(r=>r.name), data: rows.map(r=>r.value)});",
      "BCAVE.chart.line(document.getElementById('c'), {unit:'krw', series:[{label:'총매출',data:[]},{label:'주문건수',data:[]}]});",
      "```",
    ].join("\n"));
    const rules = lintDesignArtifact("bcave", file).violations.map((v) => v.rule);
    expect(rules).toEqual(expect.arrayContaining([
      "R6-unknown-class", "R11-donut-limit", "R12-mixed-units", "R13-customer-unit", "R14-hero-structure", "R14-hero-no-kpi",
    ]));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
