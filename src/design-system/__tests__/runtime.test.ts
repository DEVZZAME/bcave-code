import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleDesignArtifact, assembleDesignArtifactParts, detectDesignSystemFromArtifact, detectDesignSystemFromRequest, designSystemNames, lintDesignArtifact } from "../runtime.js";

function writeArtifact(source: string): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-design-"));
  const file = path.join(dir, "dashboard.html");
  fs.writeFileSync(file, assembleDesignArtifact("bcave", source, file), "utf8");
  return { dir, file };
}

describe("BCAVE design pipeline", () => {
  it("discovers both packaged design systems", () => {
    expect(designSystemNames()).toEqual(expect.arrayContaining(["axis", "bcave"]));
  });

  it("detects the design system from an artifact path in an edit request", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-design-request-"));
    const file = path.join(dir, "sales-dashboard.html");
    fs.writeFileSync(file, "<style>/* BCAVE:ASSET tokens */</style>", "utf8");
    expect(detectDesignSystemFromRequest(`sales-dashboard.html의 hero를 제거해줘`, dir)).toBe("bcave");
    fs.rmSync(dir, { recursive: true, force: true });
  });

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

  it("accepts a non-template diagnostic layout without hero or KPI cards", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-design-diagnostic-"));
    const file = path.join(dir, "diagnostic.html");
    const html = assembleDesignArtifactParts(
      "bcave",
      '<div class="topbar"><div class="topbar-inner"><div class="logo">B.CAVE</div></div></div><div class="page"><div class="layout-main-rail"><div class="card"><h3>원인 분해</h3></div><aside class="insight-panel"><h3>핵심 인사이트</h3><div class="sub">감소 원인을 확인했습니다.</div></aside></div></div>',
      "void 0;",
      file,
    );
    fs.writeFileSync(file, html, "utf8");
    expect(lintDesignArtifact("bcave", file).pass).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("moves a top-level hero into the page container", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-hero-container-"));
    const file = path.join(dir, "dashboard.html");
    const html = assembleDesignArtifactParts(
      "bcave",
      '<div class="topbar"></div><section class="hero"><div class="top"><h1>성과</h1><div class="rule"></div><div class="dept">기간</div></div></section><div class="page"><div class="sec-head"><h2>내용</h2></div></div>',
      "void 0;",
      file,
    );
    const pageAt = html.indexOf('<div class="page">');
    const heroAt = html.indexOf('<section class="hero">');
    expect(pageAt).toBeGreaterThan(0);
    expect(heroAt).toBeGreaterThan(pageAt);
    fs.writeFileSync(file, html, "utf8");
    expect(lintDesignArtifact("bcave", file).violations.map((v) => v.rule)).not.toContain("R15-hero-container");
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

describe("AXIS design pipeline", () => {
  it("assembles AXIS assets, detects the marker, and passes its own lint", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axis-design-"));
    const file = path.join(dir, "dashboard.html");
    const html = assembleDesignArtifactParts(
      "axis",
      '<div class="topbar"><div class="topbar-inner"><div class="logo">AXIS</div></div></div><div class="page"><div class="kpi-grid"><div class="kpi"><div class="val num" id="sales"></div></div></div></div>',
      "document.getElementById('sales').textContent = AXIS.fmt.krw(100);",
      file,
    );
    fs.writeFileSync(file, html, "utf8");
    expect(html).toContain("AXIS:ASSET tokens");
    expect(html).toContain("global.AXIS.chart = api");
    expect(detectDesignSystemFromArtifact(file)).toBe("axis");
    expect(lintDesignArtifact("axis", file).pass).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("uses AXIS-specific lint rules", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axis-design-bad-"));
    const file = path.join(dir, "dashboard.html");
    const html = assembleDesignArtifactParts(
      "axis",
      '<div class="page" style="color:#ff0000"><div>--control-height-md:</div><canvas id="c"></canvas></div>',
      "new Chart(document.getElementById('c'), {});",
      file,
    );
    fs.writeFileSync(file, html, "utf8");
    const rules = lintDesignArtifact("axis", file).violations.map((v) => v.rule);
    expect(rules).toEqual(expect.arrayContaining(["R2-no-inline-style", "R3-alien-hex", "R5-no-raw-chart", "R11-no-density-override"]));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
