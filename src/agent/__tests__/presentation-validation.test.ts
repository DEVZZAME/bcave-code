import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  appendedTemplateDeckIssues,
  dataReflectionIssues,
  emptyTableIssues,
  extractNumericTokens,
  extractNumericLabelPairs,
  duplicateLargeTitleIssues,
  newShapeIssues,
  retainedTemplateTextIssues,
  tocBodyIssues,
  validatePresentationGate,
} from "../presentation-validation.js";

const roots: string[] = [];
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function paragraph(text: string, size = 1800): string {
  return `<a:p><a:r><a:rPr sz="${size}"/><a:t>${esc(text)}</a:t></a:r></a:p>`;
}

function tableXml(rows: string[][]): string {
  return `<p:graphicFrame><a:graphic><a:graphicData><a:tbl>${rows.map((row) => `<a:tr>${row.map((cell) => cell === "__HMERGE__" ? `<a:tc hMerge="1"><a:txBody>${paragraph("")}</a:txBody></a:tc>` : `<a:tc><a:txBody>${paragraph(cell)}</a:txBody></a:tc>`).join("")}</a:tr>`).join("")}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

function makePptx(name: string, slides: Array<{ paragraphs: Array<string | [string, number]>; table?: string[][]; shapeIds?: number[] }>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ppt-gate-${name}-`));
  roots.push(root);
  fs.mkdirSync(path.join(root, "src", "ppt", "slides"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "ppt", "_rels"), { recursive: true });
  const ids = slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("");
  fs.writeFileSync(path.join(root, "src", "ppt", "presentation.xml"), `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${ids}</p:sldIdLst></p:presentation>`);
  const rels = slides.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("");
  fs.writeFileSync(path.join(root, "src", "ppt", "_rels", "presentation.xml.rels"), `<Relationships>${rels}</Relationships>`);
  slides.forEach((slide, index) => {
    const body = slide.paragraphs.map((value) => Array.isArray(value) ? paragraph(value[0], value[1]) : paragraph(value)).join("");
    const shapes = (slide.shapeIds ?? []).map((id) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/></p:nvSpPr><p:txBody>${paragraph(`shape-${id}`)}</p:txBody></p:sp>`).join("");
    fs.writeFileSync(path.join(root, "src", "ppt", "slides", `slide${index + 1}.xml`), `<p:sld xmlns:p="p" xmlns:a="a">${body}${shapes}${slide.table ? tableXml(slide.table) : ""}</p:sld>`);
  });
  const out = path.join(root, `${name}.pptx`);
  const zipped = spawnSync("zip", ["-qr", out, "ppt"], { cwd: path.join(root, "src") });
  if (zipped.status !== 0) throw new Error(String(zipped.stderr));
  return out;
}

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("generic presentation gate", () => {
  it("detects retained editable text while excluding repeated fixed company text", () => {
    const template = makePptx("template-a", [
      { paragraphs: ["ACME", "Replace title"] },
      { paragraphs: ["ACME", "Replace details"] },
    ]);
    const output = makePptx("output-a", [
      { paragraphs: ["ACME", "Quarterly review"] },
      { paragraphs: ["ACME", "Replace details"] },
    ]);
    const issues = retainedTemplateTextIssues(template, output);
    expect(issues).toEqual([expect.stringContaining("slide2.xml: 템플릿 원문 'Replace details' 잔존")]);
    expect(issues.join(" ")).not.toContain("ACME");
  });

  it("works with a second template structure without hardcoded phrases", () => {
    const template = makePptx("template-b", [
      { paragraphs: ["会社", "入力してください", "補足文"] },
      { paragraphs: ["会社", "項目を追加"] },
    ]);
    const output = makePptx("output-b", [
      { paragraphs: ["会社", "事業計画", "成長施策"] },
      { paragraphs: ["会社", "売上分析"] },
    ]);
    expect(retainedTemplateTextIssues(template, output)).toEqual([]);
  });

  it("reports the slide, table, and blank cell locations", () => {
    const output = makePptx("empty-table", [{ paragraphs: ["분석"], table: [["항목", "수치"], ["A", ""], ["", ""]] }]);
    expect(emptyTableIssues(output)).toEqual([expect.stringContaining("slide1.xml: 표 1의 본문 빈 셀 3/4")]);
  });

  it("does not count hMerge continuation cells as empty table cells", () => {
    const output = makePptx("merged-table", [{
      paragraphs: ["분석"],
      table: [["주제", "수치", "설명", "", ""], ["자동화", "24", "대표 의견", "__HMERGE__", "__HMERGE__"]],
    }]);
    expect(emptyTableIssues(output, 0)).toEqual([]);
  });

  it("allows dynamically detected structural text and source-backed coincidental text", () => {
    const template = makePptx("template-structural", [
      { paragraphs: ["CONTENTS", "01 Replace section"] },
      { paragraphs: ["Replace title", "이미지 생성"], table: [["구분", "내용"], ["Replace", "Replace"]] },
      { paragraphs: ["E.O.D", "감사합니다"] },
    ]);
    const output = makePptx("output-structural", [
      { paragraphs: ["CONTENTS", "01 분석 결과"] },
      { paragraphs: ["활용 현황", "이미지 생성"], table: [["구분", "내용"], ["도구", "11건"]] },
      { paragraphs: ["E.O.D", "감사합니다"] },
    ]);
    expect(retainedTemplateTextIssues(template, output, ["이미지 생성 AI는 11건"])).toEqual([]);
  });

  it("detects a contents item without a matching body section", () => {
    const output = makePptx("toc-mismatch", [
      { paragraphs: ["CONTENTS", "01 Strategy", "02 Execution"] },
      { paragraphs: ["Strategy"] },
    ]);
    expect(tocBodyIssues(output)).toEqual([expect.stringContaining("Execution")]);
  });

  it("detects a complete template deck retained as an appended prefix", () => {
    const template = makePptx("template-prefix", [
      { paragraphs: ["Cover"], shapeIds: [1] },
      { paragraphs: ["Guide"], shapeIds: [2, 3] },
    ]);
    const output = makePptx("output-prefix", [
      { paragraphs: ["New cover"], shapeIds: [1] },
      { paragraphs: ["Guide"], shapeIds: [2, 3] },
      { paragraphs: ["Result"], shapeIds: [4] },
    ]);
    expect(appendedTemplateDeckIssues(template, output)).toEqual([expect.stringContaining("원본 템플릿 2장이 앞부분에 그대로 잔존")]);
  });

  it("detects an overlay shape that did not exist in the source slide", () => {
    const template = makePptx("template-shape", [{ paragraphs: ["Replace"], shapeIds: [1, 2] }]);
    const output = makePptx("output-shape", [{ paragraphs: ["Done"], shapeIds: [1, 2, 99] }]);
    expect(newShapeIssues(template, output)).toEqual([expect.stringContaining("slide1.xml: 원본 slide1.xml에 없는 신규 <p:sp> 도형 1개 추가됨 (99 'Shape 99')")]);
  });

  it("detects duplicate large titles on one slide", () => {
    const output = makePptx("duplicate-title", [{ paragraphs: [["핵심 요약", 3200], ["핵심 요약", 3200]] }]);
    expect(duplicateLargeTitleIssues(output)).toEqual([expect.stringContaining("slide1.xml: 대형 제목 텍스트 중복 (핵심 요약)")]);
  });

  it("checks numeric values together with their adjacent labels", () => {
    const output = makePptx("swapped-values", [{ paragraphs: ["데이터 연동·자동화 22건", "교육·가이드 24건"] }]);
    const source = "| 주제 | 언급 |\n|---|---|\n| 데이터 연동·자동화 | 24건 |\n| 교육·가이드 | 22건 |";
    expect(extractNumericLabelPairs(source)).toEqual([
      { label: "데이터 연동·자동화", value: "24건" },
      { label: "교육·가이드", value: "22건" },
    ]);
    expect(dataReflectionIssues(output, [source], 2, 1)).toEqual([expect.stringContaining("수치-라벨 짝 반영 부족")]);
  });

  it("passes a completed deck and verifies source numeric tokens", () => {
    const template = makePptx("template-ok", [{ paragraphs: ["Replace heading", "Replace metric"] }]);
    const output = makePptx("output-ok", [{ paragraphs: ["성과 요약", "응답 10건 · 참여 20명"] }]);
    expect(extractNumericTokens("응답 10건, 참여 20명")).toEqual(["10건", "20명"]);
    expect(dataReflectionIssues(output, ["응답 10건, 참여 20명"], 2, 1)).toEqual([]);
    expect(validatePresentationGate(template, output, ["응답 10건, 참여 20명"])).toEqual([]);
  });
});
