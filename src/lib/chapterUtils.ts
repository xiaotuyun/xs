import { Chapter, Volume } from '../types';

/**
 * Parses a chapter number from a title string.
 * Supports Arabic numerals ("第4章", "第 10 章", "4章", "Chapter 5")
 * and Chinese numerals ("第四章", "第十章", "第一百二十三章").
 */
export function parseChapterNumberFromTitle(title: string): number | null {
  if (!title) return null;

  let cleanTitle = title.trim();
  // Clean markdown bold syntax, quotes, and brackets from start and end
  cleanTitle = cleanTitle.replace(/^\s*\*\*+\s*/g, '').replace(/\s*\*\*+\s*$/g, '');
  cleanTitle = cleanTitle.replace(/^[\s"'`【#]*|[\s"'`】]*$/g, '').trim();

  // 1. Arabic numerals match: "第9章", "第 10 章", "4章", "Chapter 12"
  const arabicMatch = cleanTitle.match(/(?:第|Chapter|\b)\s*(\d+)\s*(?:章|\b)/i);
  if (arabicMatch && arabicMatch[1]) {
    const num = parseInt(arabicMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  // 2. Chinese numerals match: "第四章", "第十章", "第一百二十三章"
  const chineseMatch = cleanTitle.match(/第\s*([零一二三四五六七八九十百千万0-9]+)\s*章/);
  if (chineseMatch && chineseMatch[1]) {
    const parsed = chineseToNumber(chineseMatch[1]);
    if (parsed !== null) return parsed;
  }

  return null;
}

function chineseToNumber(str: string): number | null {
  if (!str) return null;
  if (/^\d+$/.test(str)) return parseInt(str, 10);

  const charMap: Record<string, number> = {
    '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
  };

  if (str.length === 1 && charMap[str] !== undefined) {
    return charMap[str];
  }

  let total = 0;
  let section = 0;
  let number = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const val = charMap[char];
    if (val !== undefined) {
      if (val < 10) {
        number = val;
      } else if (val === 10) {
        if (number === 0) number = 1;
        section += number * 10;
        number = 0;
      } else if (val === 100) {
        if (number === 0) number = 1;
        section += number * 100;
        number = 0;
      }
    }
  }
  total += section + number;
  return total > 0 ? total : null;
}

/**
 * Normalizes a chapter title string to match a target chapter number.
 * e.g., replaceChapterTitleNumber("第一章 遗迹终局", 12) => "第12章 遗迹终局"
 * e.g., replaceChapterTitleNumber("第9章 破格奖励", 4) => "第4章 破格奖励"
 * e.g., replaceChapterTitleNumber("核心看点", 5) => "第5章 核心看点"
 */
export function replaceChapterTitleNumber(title: string, newNumber: number): string {
  if (!title) return `第${newNumber}章`;

  let trimmed = title.trim();
  // Clean markdown bold syntax, quotes, and brackets from start and end
  trimmed = trimmed.replace(/^\s*\*\*+\s*/g, '').replace(/\s*\*\*+\s*$/g, '');
  trimmed = trimmed.replace(/^[\s"'`【#]*|[\s"'`】]*$/g, '').trim();

  // Pattern 1: Starts with "第 [0-9一二三四五六七八九十百千]+ 章"
  const prefixRegex = /^第\s*([零一二三四五六七八九十百千万0-9]+)\s*章[\s：:\-—]*|^(?:Chapter|\b)\s*(\d+)\s*(?:章|\b)[\s：:\-—]*/i;

  if (prefixRegex.test(trimmed)) {
    return trimmed.replace(prefixRegex, `第${newNumber}章 `).replace(/\s+/g, ' ');
  }

  // If no "第X章" prefix, check if it starts with "第X章" without space or colon
  return `第${newNumber}章 ${trimmed}`;
}

/**
 * Gets the effective chapter number for sorting purposes.
 */
export function getEffectiveChapterNumber(chap: Chapter): number {
  const parsed = parseChapterNumberFromTitle(chap.title);
  if (parsed !== null) return parsed;
  return chap.chapterNumber || 0;
}

/**
 * Sorts an array of chapters by effective chapter number in ascending order.
 */
export function sortChapters<T extends Chapter>(chapters: T[]): T[] {
  return [...chapters].sort((a, b) => getEffectiveChapterNumber(a) - getEffectiveChapterNumber(b));
}

/**
 * Enforces that a single volume contains exactly the specified number of chapters.
 * If AI returned fewer chapters, synthesizes and appends missing chapters with coherent plot titles.
 * If AI returned more chapters, cleanly truncates to target count.
 */
export function enforceExactChaptersForVolume(
  rawChapters: any[],
  targetChapCount: number,
  startChapNumber = 1,
  volNumber = 1,
  volTitle = ""
): Chapter[] {
  const existing = Array.isArray(rawChapters) ? rawChapters : [];
  const chapters: Chapter[] = [];

  const defaultTitleThemes = [
    "风云初动与暗流微显",
    "局势突变与针锋相对",
    "步步为营与破局转机",
    "锋芒毕露与力挽狂澜",
    "绝处逢生与底牌尽出",
    "强敌来袭与生死决战",
    "尘埃落定与更远征途",
    "造化机缘与实力跃迁",
    "秘境探幽与重重杀机",
    "终极对决与名动天下"
  ];

  for (let c = 0; c < targetChapCount; c++) {
    const chapIndex = startChapNumber + c;
    const rawChap = existing[c];

    if (rawChap) {
      const rawTitle = rawChap.title ? String(rawChap.title).trim() : "";
      const normalizedTitle = rawTitle ? replaceChapterTitleNumber(rawTitle, chapIndex) : `第${chapIndex}章 ${defaultTitleThemes[c % defaultTitleThemes.length]}`;
      const normalizedSummary = rawChap.summary ? String(rawChap.summary).trim() : `本章剧情紧承前文，主角在当前局势中展开行动，推进核心冲突与伏笔。`;

      chapters.push({
        id: rawChap.id || `chap-${Date.now()}-${volNumber}-${c}`,
        chapterNumber: chapIndex,
        title: normalizedTitle,
        summary: normalizedSummary,
        content: rawChap.content || '',
        wordCount: rawChap.wordCount || 0,
        status: rawChap.status || 'draft',
      });
    } else {
      const fallbackTitle = `第${chapIndex}章 ${defaultTitleThemes[c % defaultTitleThemes.length]}`;
      const fallbackSummary = `本章紧密承接上文剧情发展，主角深入探索核心线索，局势迎来关键突破与剧情转折。`;

      chapters.push({
        id: `chap-${Date.now()}-${volNumber}-${c}`,
        chapterNumber: chapIndex,
        title: fallbackTitle,
        summary: fallbackSummary,
        content: '',
        wordCount: 0,
        status: 'draft',
      });
    }
  }

  return chapters;
}

/**
 * Enforces that an outline contains EXACTLY the specified number of volumes,
 * and that each volume contains EXACTLY the specified number of chapters.
 * Guarantees 100% adherence to user-selected volumeCount and chapterCount.
 */
export function enforceExactVolumesAndChapters(
  rawVolumes: any[],
  targetVolCount: number,
  targetChapCount: number,
  startVolNum = 1,
  startChapNum = 1,
  existingNovelVolumes?: Volume[]
): Volume[] {
  const existingVols = Array.isArray(rawVolumes) ? rawVolumes : [];
  const volumes: Volume[] = [];
  let currentChapIndex = startChapNum;

  const defaultVolThemes = [
    "崛起微末篇",
    "风云争锋篇",
    "动荡变革篇",
    "巅峰对决篇",
    "寰宇纵横篇",
    "大道归一篇",
    "万界主宰篇",
    "神话终局篇"
  ];

  for (let v = 0; v < targetVolCount; v++) {
    const volNum = startVolNum + v;
    const rawVol = existingVols[v];
    const existingVol = existingNovelVolumes ? existingNovelVolumes[v] : undefined;

    let volTitle = "";
    let volSummary = "";

    if (rawVol) {
      volTitle = rawVol.volumeTitle ? String(rawVol.volumeTitle).trim() : `第${volNum}卷 ${defaultVolThemes[v % defaultVolThemes.length]}`;
      volSummary = rawVol.summary ? String(rawVol.summary).trim() : `本卷围绕核心冲突展开，剧情层层递进，将全书主线推向阶段性高潮。`;
    } else {
      volTitle = `第${volNum}卷 ${defaultVolThemes[v % defaultVolThemes.length]}`;
      volSummary = `本卷围绕核心冲突展开，主角实力与眼界进一步拓展，迎来更为宏大的交锋与挑战。`;
    }

    const rawChaps = rawVol ? (rawVol.chapters || rawVol.newChapters || []) : [];
    const formattedChapters = enforceExactChaptersForVolume(
      rawChaps,
      targetChapCount,
      currentChapIndex,
      volNum,
      volTitle
    );

    // If existing chapters exist in the novel (e.g. updating current novel), preserve their contents
    if (existingVol) {
      formattedChapters.forEach((ch, idx) => {
        const existCh = existingVol.chapters[idx] || existingVol.chapters.find(item => item.chapterNumber === ch.chapterNumber);
        if (existCh) {
          ch.id = existCh.id;
          ch.content = existCh.content || ch.content;
          ch.wordCount = existCh.wordCount || ch.wordCount;
          ch.status = existCh.status || ch.status;
        }
      });
    }

    currentChapIndex += targetChapCount;

    volumes.push({
      id: (existingVol?.id) || rawVol?.id || `vol-${Date.now()}-${v}`,
      volumeNumber: volNum,
      volumeTitle: volTitle,
      summary: volSummary,
      chapters: formattedChapters,
    });
  }

  return volumes;
}

/**
 * Normalizes all volumes and chapters across a novel so that:
 * 1. Chapters are globally indexed 1, 2, 3... N across all volumes in order.
 * 2. `chapterNumber` is updated to equal global index.
 * 3. Chapter title prefix "第X章" is updated to match global index ("第12章 ...").
 */
export function normalizeNovelChaptersAndTitles(volumes: Volume[]): Volume[] {
  let globalChapIndex = 1;

  return volumes.map((vol, vIdx) => {
    // Sort chapters in this volume first by effective chapter number
    const sortedChapters = sortChapters(vol.chapters);

    const reindexedChapters = sortedChapters.map((chap) => {
      const targetIndex = globalChapIndex++;
      const newTitle = replaceChapterTitleNumber(chap.title, targetIndex);

      return {
        ...chap,
        chapterNumber: targetIndex,
        title: newTitle,
      };
    });

    return {
      ...vol,
      volumeNumber: vIdx + 1,
      chapters: reindexedChapters,
    };
  });
}


