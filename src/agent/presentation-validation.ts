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

function slideContentRows(filePath: string, slidePath: string): string[] {
  const xml = unzipText(filePath, slidePath);
  const tableRows = [...xml.matchAll(/<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g)].map((row) =>
    normalizeText([...row[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => match[1]).join(" | ")),
  ).filter(Boolean);
  return [...slideParagraphs(filePath, slidePath), ...tableRows];
}

function templateEditableTextSet(templatePath: string): Set<string> {
  const slides = pptxRegisteredSlidePaths(templatePath);
  const bySlide = slides.map((slide) => new Set(pptxSlideTextRuns(templatePath, slide)));
  const counts = new Map<string, number>();
  for (const runs of bySlide) for (const run of runs) counts.set(run, (counts.get(run) ?? 0) + 1);
  const fixed = new Set([...counts].filter(([text, count]) => count === slides.length || /^\d+$/.test(text) || /^‹#›$/.test(text)).map(([text]) => text));
  return new Set([...counts.keys()].filter((text) => !fixed.has(text)));
}

function templateStructuralTextSet(templatePath: string): Set<string> {
  const slides = pptxRegisteredSlidePaths(templatePath);
  const structural = new Set<string>();
  for (const slide of slides) {
    const xml = unzipText(templatePath, slide);
    // 표의 첫 행은 데이터가 아니라 열 이름이므로 그대로 유지해도 된다.
    for (const table of xml.matchAll(/<a:tbl>([\s\S]*?)<\/a:tbl>/g)) {
      const header = table[1].match(/<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/)?.[1] ?? "";
      for (const text of header.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)) structural.add(normalizeText(text[1]));
    }
    const runs = pptxSlideTextRuns(templatePath, slide);
    const tocMarker = runs.find((text) => /^(?:contents|목차)$/i.test(text));
    if (tocMarker) structural.add(tocMarker);
    for (const text of runs) if (/^[^\p{L}\p{N}]+$/u.test(text)) structural.add(text);
  }
  // 마지막 슬라이드가 E.O.D 같은 약어형 종결 마커를 가진 간결한 엔딩이면 해당 문구는 고정 요소다.
  const endingRuns = slides.length ? pptxSlideTextRuns(templatePath, slides[slides.length - 1]) : [];
  if (endingRuns.length <= 3 && endingRuns.some((text) => text.includes(".") && /^(?:[A-Z]\.?){2,}$/i.test(text))) {
    for (const text of endingRuns) structural.add(text);
  }
  return structural;
}

export function retainedTemplateTextIssues(templatePath: string, outputPath: string, sourceTexts: string[] = []): string[] {
  const sourceText = templateEditableTextSet(templatePath);
  const structuralText = templateStructuralTextSet(templatePath);
  const issues: string[] = [];
  for (const slide of pptxRegisteredSlidePaths(outputPath)) {
    const retained = [...new Set(pptxSlideTextRuns(outputPath, slide).filter((text) =>
      sourceText.has(text) && !structuralText.has(text) && !sourceTexts.some((source) => normalizeText(source).includes(text)),
    ))];
    for (const text of retained.slice(0, 8)) issues.push(`${path.posix.basename(slide)}: 템플릿 원문 '${text}' 잔존`);
  }
  return issues;
}

function slideStructureSignature(filePath: string, slidePath: string): string {
  return [...unzipText(filePath, slidePath).matchAll(/<(?:p|a):cNvPr\b[^>]*\bid="(\d+)"/g)]
    .map((match) => match[1]).sort((a, b) => Number(a) - Number(b)).join(",");
}

function slideShapeMap(filePath: string, slidePath: string): Map<string, string> {
  const shapes = new Map<string, string>();
  for (const match of unzipText(filePath, slidePath).matchAll(/<p:sp\b[\s\S]*?<p:cNvPr\b([^>]*)>[\s\S]*?<\/p:sp>/g)) {
    const id = match[1].match(/\bid="([^"]+)"/)?.[1];
    const name = match[1].match(/\bname="([^"]*)"/)?.[1] ?? "";
    if (id) shapes.set(id, name);
  }
  return shapes;
}

/** 어떤 원본 슬라이드에도 없던 <p:sp> 덧대기를 슬라이드·도형 단위로 보고한다. */
export function newShapeIssues(templatePath: string, outputPath: string): string[] {
  const templateShapes = pptxRegisteredSlidePaths(templatePath).map((slide) => ({ slide, shapes: slideShapeMap(templatePath, slide) }));
  const issues: string[] = [];
  for (const outputSlide of pptxRegisteredSlidePaths(outputPath)) {
    const outputShapes = slideShapeMap(outputPath, outputSlide);
    if (!outputShapes.size || !templateShapes.length) continue;
    const closest = templateShapes.map((candidate) => ({
      ...candidate,
      added: [...outputShapes.keys()].filter((id) => !candidate.shapes.has(id)),
      removed: [...candidate.shapes.keys()].filter((id) => !outputShapes.has(id)),
    })).sort((a, b) => (a.added.length + a.removed.length) - (b.added.length + b.removed.length))[0];
    if (closest.added.length) {
      const detail = closest.added.slice(0, 6).map((id) => `${id}${outputShapes.get(id) ? ` '${outputShapes.get(id)}'` : ""}`).join(", ");
      issues.push(`${path.posix.basename(outputSlide)}: 원본 ${path.posix.basename(closest.slide)}에 없는 신규 <p:sp> 도형 ${closest.added.length}개 추가됨 (${detail})`);
    }
  }
  return issues;
}

/** 템플릿 전체를 앞에 그대로 둔 채 결과 슬라이드를 이어붙인 흔적을 탐지한다. */
export function appendedTemplateDeckIssues(templatePath: string, outputPath: string): string[] {
  const templateSlides = pptxRegisteredSlidePaths(templatePath);
  const outputSlides = pptxRegisteredSlidePaths(outputPath);
  if (templateSlides.length < 2 || outputSlides.length <= templateSlides.length) return [];
  const retainedPrefix = templateSlides.every((slide, index) =>
    slideStructureSignature(templatePath, slide) === slideStructureSignature(outputPath, outputSlides[index]),
  );
  return retainedPrefix
    ? [`slide1.xml~slide${templateSlides.length}.xml: 원본 템플릿 ${templateSlides.length}장이 앞부분에 그대로 잔존하고 뒤에 ${outputSlides.length - templateSlides.length}장이 이어붙었습니다.`]
    : [];
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
        [...row[1].matchAll(/<a:tc\b([^>]*)>([\s\S]*?)<\/a:tc>/g)].forEach((cell, columnIndex) => {
          if (/\bhMerge="1"/.test(cell[1])) return;
          bodyCells++;
          const value = normalizeText([...cell[2].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => match[1]).join(""));
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
  const numberedBody = paragraphs.flatMap((items, index) => index === tocIndex ? [] : items)
    .filter((text) => /^\d{1,2}\s*[.)-]?\s*\S+/.test(text)).map(tocItem).filter(Boolean);
  const extra = numberedBody.filter((item) => !numbered.includes(item));
  const issues: string[] = [];
  if (missing.length) issues.push(`${path.posix.basename(slides[tocIndex])}: 목차 항목과 일치하는 본문 섹션 제목 없음 (${[...new Set(missing)].join(", ")})`);
  if (duplicate.length) issues.push(`${path.posix.basename(slides[tocIndex])}: 목차 항목 중복 (${[...new Set(duplicate)].join(", ")})`);
  if (extra.length) issues.push(`${path.posix.basename(slides[tocIndex])}: 목차에 없는 본문 섹션 제목 존재 (${[...new Set(extra)].join(", ")})`);
  return issues;
}

export function extractNumericTokens(sourceText: string): string[] {
  return [...new Set([...sourceText.matchAll(/(?<![\d.])\d[\d,.]*\s*(?:%|건|명|원|회|개|일|분)(?![가-힣A-Za-z0-9])/g)].map((match) => normalizeText(match[0]).replace(/\s+/g, "")))];
}

export interface NumericLabelPair { label: string; value: string }

function normalizeLabel(value: string): string {
  return normalizeText(value).replace(/[*_`#>|:[\]()]/g, " ").replace(/\s+/g, " ").trim();
}

/** 원본의 표 행/문장에서 숫자와 바로 인접한 의미 라벨을 함께 보존한다. */
export function extractNumericLabelPairs(sourceText: string): NumericLabelPair[] {
  const pairs: NumericLabelPair[] = [];
  for (const rawLine of sourceText.split(/\r?\n/)) {
    const line = normalizeText(rawLine);
    if (!line || /^\|?\s*:?-{3,}/.test(line)) continue;
    const cells = rawLine.includes("|") ? rawLine.split("|").map(normalizeLabel).filter(Boolean) : [];
    if (cells.length >= 2) {
      for (let index = 1; index < cells.length; index++) {
        const value = cells[index].match(/^(\d[\d,.]*\s*(?:%|건|명|원|회|개|일|분)?)$/)?.[1];
        const label = cells[index - 1];
        if (value && label && !/^(수|응답|비율|언급)$/.test(label)) pairs.push({ label, value: value.replace(/\s+/g, "") });
      }
      continue;
    }
    for (const match of line.matchAll(/([^.!?→—–-]{2,40}?)\s+(\d[\d,.]*\s*(?:%|건|명|원|회|개|일|분))(?![가-힣A-Za-z0-9])/g)) {
      const label = normalizeLabel(match[1]).split(/[,·]/).pop()?.trim() ?? "";
      if (label) pairs.push({ label, value: match[2].replace(/\s+/g, "") });
    }
  }
  return [...new Map(pairs.map((pair) => [`${pair.label}\u0000${pair.value}`, pair])).values()];
}

export function dataReflectionIssues(outputPath: string, sourceTexts: string[], minimum = 10, ratio = 0.35): string[] {
  const tokens = [...new Set(sourceTexts.flatMap(extractNumericTokens))].slice(0, 40);
  if (!tokens.length) return [];
  const output = pptxRegisteredSlidePaths(outputPath).flatMap((slide) => pptxSlideTextRuns(outputPath, slide)).join(" ").replace(/\s+/g, "");
  const present = tokens.filter((token) => output.includes(token));
  const required = Math.min(tokens.length, Math.max(Math.min(minimum, tokens.length), Math.ceil(tokens.length * ratio)));
  const issues: string[] = [];
  const missing = tokens.filter((token) => !output.includes(token));
  if (present.length < required) issues.push(`원본 수치 토큰 반영 부족: ${present.length}/${tokens.length}개 확인, 최소 ${required}개 필요 (누락 예: ${missing.slice(0, 8).join(", ")})`);

  const pairs = [...new Map(sourceTexts.flatMap(extractNumericLabelPairs).map((pair) => [`${pair.label}\u0000${pair.value}`, pair])).values()].slice(0, 60);
  if (pairs.length) {
    const rows = pptxRegisteredSlidePaths(outputPath).flatMap((slide) => slideContentRows(outputPath, slide));
    const matched = pairs.filter(({ label, value }) => rows.some((row) => {
      const compact = row.replace(/\s+/g, "");
      return compact.includes(label.replace(/\s+/g, "")) && compact.includes(value);
    }));
    const pairRequired = Math.min(pairs.length, Math.max(Math.min(minimum, pairs.length), Math.ceil(pairs.length * ratio)));
    if (matched.length < pairRequired) {
      const unmatched = pairs.filter((pair) => !matched.includes(pair));
      issues.push(`원본 수치-라벨 짝 반영 부족: ${matched.length}/${pairs.length}개 확인, 최소 ${pairRequired}개 필요 (불일치 예: ${unmatched.slice(0, 6).map(({ label, value }) => `'${label}'=${value}`).join(", ")})`);
    }
  }
  return issues;
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
    ...appendedTemplateDeckIssues(templatePath, outputPath),
    ...newShapeIssues(templatePath, outputPath),
    ...retainedTemplateTextIssues(templatePath, outputPath, sourceTexts),
    ...emptyTableIssues(outputPath),
    ...tocBodyIssues(outputPath),
    ...dataReflectionIssues(outputPath, sourceTexts),
    ...duplicateLargeTitleIssues(outputPath),
  ];
}
