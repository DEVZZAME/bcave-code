import { spawnSync } from "node:child_process";
import path from "node:path";

const XML_LIMIT = 32 * 1024 * 1024;

function unzipText(filePath: string, entry: string): string {
  const result = spawnSync("unzip", ["-p", filePath, entry], { encoding: "utf8", timeout: 10_000, maxBuffer: XML_LIMIT });
  return result.status === 0 ? String(result.stdout) : "";
}

function decodeXml(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function normalizeText(value: string): string {
  return decodeXml(value).replace(/\s+/g, " ").trim();
}

export function pptxRegisteredSlidePaths(filePath: string): string[] {
  const presentation = unzipText(filePath, "ppt/presentation.xml");
  const relationships = unzipText(filePath, "ppt/_rels/presentation.xml.rels");
  const targets = new Map<string, string>();
  for (const match of relationships.matchAll(/<Relationship\b([^>]*)>/g)) {
    const attrs = match[1];
    if (!/\bType="[^"]+\/slide"/.test(attrs)) continue;
    const id = attrs.match(/\bId="([^"]+)"/)?.[1];
    const target = attrs.match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) targets.set(id, path.posix.normalize(`ppt/${target}`));
  }
  return [...presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"[^>]*>/g)].map((match) => targets.get(match[1]) ?? "").filter(Boolean);
}

export function pptxSlideTextRuns(filePath: string, slidePath: string): string[] {
  return [...unzipText(filePath, slidePath).matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => normalizeText(match[1])).filter(Boolean);
}

function slideParagraphs(filePath: string, slidePath: string): string[] {
  const xml = unzipText(filePath, slidePath);
  return [...xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)].map((paragraph) =>
    normalizeText([...paragraph[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => match[1]).join("")),
  ).filter(Boolean);
}

function templateEditableTextSet(templatePath: string): Set<string> {
  const slides = pptxRegisteredSlidePaths(templatePath);
  const bySlide = slides.map((slide) => new Set(pptxSlideTextRuns(templatePath, slide)));
  const counts = new Map<string, number>();
  for (const runs of bySlide) for (const run of runs) counts.set(run, (counts.get(run) ?? 0) + 1);
  const fixed = new Set([...counts].filter(([text, count]) => count === slides.length || /^\d+$/.test(text) || /^‹#›$/.test(text)).map(([text]) => text));
  return new Set([...counts.keys()].filter((text) => !fixed.has(text)));
}

export function retainedTemplateTextIssues(templatePath: string, outputPath: string): string[] {
  const sourceText = templateEditableTextSet(templatePath);
  const issues: string[] = [];
  for (const slide of pptxRegisteredSlidePaths(outputPath)) {
    const retained = [...new Set(pptxSlideTextRuns(outputPath, slide).filter((text) => sourceText.has(text)))];
    for (const text of retained.slice(0, 8)) issues.push(`${path.posix.basename(slide)}: 템플릿 원문 '${text}' 잔존`);
  }
  return issues;
}

export function emptyTableIssues(outputPath: string, threshold = 0.2): string[] {
  const issues: string[] = [];
  for (const slide of pptxRegisteredSlidePaths(outputPath)) {
    const xml = unzipText(outputPath, slide);
    let tableIndex = 0;
    for (const table of xml.matchAll(/<a:tbl>([\s\S]*?)<\/a:tbl>/g)) {
      tableIndex++;
      const rows = [...table[1].matchAll(/<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g)];
      const blanks: string[] = [];
      let bodyCells = 0;
      rows.slice(1).forEach((row, rowIndex) => {
        [...row[1].matchAll(/<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g)].forEach((cell, columnIndex) => {
          bodyCells++;
          const value = normalizeText([...cell[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => match[1]).join(""));
          if (!value) blanks.push(`행 ${rowIndex + 2} 열 ${columnIndex + 1}`);
        });
      });
      if (bodyCells > 0 && blanks.length / bodyCells > threshold) {
        issues.push(`${path.posix.basename(slide)}: 표 ${tableIndex}의 본문 빈 셀 ${blanks.length}/${bodyCells} (${blanks.slice(0, 5).join(", ")})`);
      }
    }
  }
  return issues;
}

function tocItem(value: string): string {
  return normalizeText(value).replace(/^\d{1,2}\s*[.)-]?\s*/, "").trim();
}

export function tocBodyIssues(outputPath: string): string[] {
  const slides = pptxRegisteredSlidePaths(outputPath);
  const paragraphs = slides.map((slide) => slideParagraphs(outputPath, slide));
  const tocIndex = paragraphs.findIndex((items) => items.some((text) => /^(contents|목차)$/i.test(text)));
  if (tocIndex < 0) return [];
  const numbered = paragraphs[tocIndex].filter((text) => /^\d{1,2}\s*[.)-]?\s*\S+/.test(text)).map(tocItem).filter(Boolean);
  if (!numbered.length) return [];
  const body = paragraphs.flatMap((items, index) => index === tocIndex ? [] : items.map(tocItem));
  const missing = numbered.filter((item) => !body.some((title) => title === item));
  const duplicate = numbered.filter((item, index) => numbered.indexOf(item) !== index);
  const issues: string[] = [];
  if (missing.length) issues.push(`${path.posix.basename(slides[tocIndex])}: 목차 항목과 일치하는 본문 섹션 제목 없음 (${[...new Set(missing)].join(", ")})`);
  if (duplicate.length) issues.push(`${path.posix.basename(slides[tocIndex])}: 목차 항목 중복 (${[...new Set(duplicate)].join(", ")})`);
  return issues;
}

export function extractNumericTokens(sourceText: string): string[] {
  return [...new Set([...sourceText.matchAll(/(?<![\d.])\d[\d,.]*\s*(?:%|건|명|원|회|개|일|분)(?![가-힣A-Za-z0-9])/g)].map((match) => normalizeText(match[0]).replace(/\s+/g, "")))];
}

export function dataReflectionIssues(outputPath: string, sourceTexts: string[], minimum = 10, ratio = 0.35): string[] {
  const tokens = [...new Set(sourceTexts.flatMap(extractNumericTokens))].slice(0, 40);
  if (!tokens.length) return [];
  const output = pptxRegisteredSlidePaths(outputPath).flatMap((slide) => pptxSlideTextRuns(outputPath, slide)).join(" ").replace(/\s+/g, "");
  const present = tokens.filter((token) => output.includes(token));
  const required = Math.min(tokens.length, Math.max(Math.min(minimum, tokens.length), Math.ceil(tokens.length * ratio)));
  if (present.length >= required) return [];
  const missing = tokens.filter((token) => !output.includes(token));
  return [`원본 수치 토큰 반영 부족: ${present.length}/${tokens.length}개 확인, 최소 ${required}개 필요 (누락 예: ${missing.slice(0, 8).join(", ")})`];
}

export function duplicateLargeTitleIssues(outputPath: string): string[] {
  const issues: string[] = [];
  for (const slide of pptxRegisteredSlidePaths(outputPath)) {
    const xml = unzipText(outputPath, slide);
    const large: string[] = [];
    for (const run of xml.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)) {
      const size = Number(run[1].match(/<a:rPr\b[^>]*\bsz="(\d+)"/)?.[1] ?? 0);
      const text = normalizeText(run[1].match(/<a:t>([\s\S]*?)<\/a:t>/)?.[1] ?? "");
      if (size >= 2400 && text.length >= 2) large.push(text);
    }
    const duplicated = [...new Set(large.filter((text, index) => large.indexOf(text) !== index))];
    if (duplicated.length) issues.push(`${path.posix.basename(slide)}: 대형 제목 텍스트 중복 (${duplicated.join(", ")})`);
  }
  return issues;
}

export function validatePresentationGate(templatePath: string, outputPath: string, sourceTexts: string[] = []): string[] {
  return [
    ...retainedTemplateTextIssues(templatePath, outputPath),
    ...emptyTableIssues(outputPath),
    ...tocBodyIssues(outputPath),
    ...dataReflectionIssues(outputPath, sourceTexts),
    ...duplicateLargeTitleIssues(outputPath),
  ];
}
