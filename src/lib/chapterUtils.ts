import { Chapter, Volume, Novel } from '../types';

/**
 * Strips raw JSON keys, braces, unescaped quotes, trailing comma artifacts,
 * and conversational prefixes/suffixes from string values.
 * Handles cases like:
 * - `"volumeTitle": "第1卷 废土垃圾场里走出的凿拳人",`
 * - `第2章 title": "第1章 废土垃圾场里捡来的半截桩功",`
 * - `"summary": "交代废土背景与陈牧在底层垃圾场的艰难求生...", "chapters": [{"chapterNumber": 1,`
 * - `{"title": "核爆废土: 我以气血横推星空", "logline": ...}`
 */
export function cleanJsonArtifacts(str: any): string {
  if (str === null || str === undefined) return '';
  if (typeof str === 'object') {
    if (str.title) return cleanJsonArtifacts(str.title);
    if (str.volumeTitle) return cleanJsonArtifacts(str.volumeTitle);
    if (str.volTitle) return cleanJsonArtifacts(str.volTitle);
    if (str.summary) return cleanJsonArtifacts(str.summary);
    if (str.name) return cleanJsonArtifacts(str.name);
    if (str.text) return cleanJsonArtifacts(str.text);
    return '';
  }

  let text = String(str).trim();

  // If text starts with full JSON object/array, try to parse and extract meaningful text
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'object') {
        const extracted = cleanJsonArtifacts(parsed);
        if (extracted) return extracted;
      }
    } catch {}
  }

  // Remove markdown code fences and bold indicators
  text = text.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();
  text = text.replace(/^\s*\*\*+\s*/g, '').replace(/\s*\*\*+\s*$/g, '');

  // Strip leading JSON key prefixes: e.g. "volumeTitle": "...", "title": "...", "summary": "..."
  const jsonKeyPrefix = /^[\{\[\s]*"?(?:volumeTitle|volTitle|chapterTitle|title|summary|logline|chapters|chapterNumber|name|description|background|powerSystem|factions)"?\s*[:：]\s*"?/i;
  while (jsonKeyPrefix.test(text)) {
    text = text.replace(jsonKeyPrefix, '').trim();
  }

  // Strip trailing JSON artifacts like: ", "chapters": [...", ", \n", etc.
  text = text.replace(/",?\s*(?:"chapters"|"summary"|"volumeTitle"|"volTitle"|"title"|"logline"|"chapterNumber")\s*[:：]\s*\[?.*$/is, '');
  text = text.replace(/[,\s"'\`\}\]]+$/g, '').trim();
  text = text.replace(/^[,\s"'\`\{\[]+/g, '').trim();

  // Strip leftover JSON key remnants in the middle (e.g. `第1章 title": "废土维修工`)
  text = text.replace(/(?:volumeTitle|volTitle|chapterTitle|title|summary|chapters|chapterNumber)\s*["']?\s*[:：]\s*["']?/gi, ' ').trim();

  // Clean unescaped quotes at borders
  text = text.replace(/^["'`]+|["'`]+$/g, '').trim();

  return text;
}

/**
 * Cleans a volume title and ensures proper "第X卷 ..." format.
 */
export function cleanVolumeTitle(volTitle: any, volNumber: number): string {
  let cleaned = cleanJsonArtifacts(volTitle);
  if (!cleaned) return `第${volNumber}卷 精彩剧情篇`;

  // Strip repeated "第X卷" prefix if it exists to normalize
  const volPrefixRegex = /^第\s*([0-9零一二三四五六七八九十百千万]+)\s*[卷篇][\s：:\-—]*/i;
  cleaned = cleaned.replace(volPrefixRegex, '').trim();
  if (!cleaned) cleaned = `精彩剧情篇`;

  return `第${volNumber}卷 ${cleaned}`;
}

/**
 * Cleans a summary string, removing JSON syntax or raw code dumps.
 */
export function cleanSummary(summary: any, fallback = ''): string {
  let cleaned = cleanJsonArtifacts(summary);
  if (!cleaned) return fallback || '本章节推进主线剧情发展，承上启下，充满看点。';
  return cleaned;
}

/**
 * Parses a chapter number from a title string.
 * Supports Arabic numerals ("第4章", "第 10 章", "4章", "Chapter 5")
 * and Chinese numerals ("第四章", "第十章", "第一百二十三章").
 */
export function parseChapterNumberFromTitle(title: string): number | null {
  if (!title) return null;

  let cleanTitle = cleanJsonArtifacts(title);

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

  let trimmed = cleanJsonArtifacts(title);

  // Pattern 1: Starts with "第 [0-9一二三四五六七八九十百千]+ 章"
  const prefixRegex = /^第\s*([零一二三四五六七八九十百千万0-9]+)\s*章[\s：:\-—]*|^(?:Chapter|\b)\s*(\d+)\s*(?:章|\b)[\s：:\-—]*/i;

  if (prefixRegex.test(trimmed)) {
    const withoutPrefix = trimmed.replace(prefixRegex, '').trim();
    return `第${newNumber}章 ${withoutPrefix || '章节内容'}`.trim();
  }

  // If no "第X章" prefix
  return `第${newNumber}章 ${trimmed}`.trim();
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

export function generateContextualFallbackChapterData(
  chapIndex: number,
  chapOffsetInVol: number,
  totalChapsInVol: number,
  volNumber: number,
  volTitle = ""
): { title: string; summary: string } {
  const cleanVol = (volTitle || "").replace(/^第\s*\d+\s*卷\s*[:：\s]*/i, '').trim() || `第${volNumber}卷`;
  const ratio = totalChapsInVol > 1 ? chapOffsetInVol / (totalChapsInVol - 1) : 0.5;

  let titleList: string[] = [];
  let summaryList: string[] = [];

  if (chapOffsetInVol === 0) {
    titleList = [
      `${cleanVol}之始，风云乍现`,
      `踏入新境，局势初定`,
      `新局拉开，序幕降临`,
      `暗潮微涌，首探虚实`
    ];
    summaryList = [
      `本章作为本卷开端，主角正式迈入【${cleanVol}】的核心舞台，初步摸清周遭险恶环境与敌友阵营，核心冲突主线全面展开。`,
      `本卷宏大序幕拉开，主角面对全新的局势与挑战迅速占据立足之地，敏锐察觉潜藏在暗处的危机与线索。`
    ];
  } else if (chapOffsetInVol === totalChapsInVol - 1) {
    titleList = [
      `乾坤底定，名动八荒`,
      `余波未平，更远征途`,
      `尘埃落定，底蕴蜕变`,
      `终局收官，威震一方`
    ];
    summaryList = [
      `本章为本卷高潮决战后的收官之章，主角彻底扫清【${cleanVol}】的残余大敌，清点巨额战果并实现境界底蕴的跨越，同时引出后续宏大伏笔。`,
      `巅峰决战落幕，主角威名传遍四方，阶段性因果彻底了结，局势迎来新的平衡，为迈向下一卷更辽阔的天地铺平道路。`
    ];
  } else if (ratio < 0.25) {
    titleList = [
      `初试锋芒，震慑宵小`,
      `线索初显，暗流激荡`,
      `立威树敌，局势升温`,
      `深入险地，机缘初露`,
      `意外变数与深入调查`,
      `小试身手，掌控主动`
    ];
    summaryList = [
      `主角在【${cleanVol}】中展开深入探索，遭遇首次冲突考验，凭借过人胆识与敏锐洞察破除迷局，逐步逼近核心秘密。`,
      `局势暗流涌动，各方势力产生摩擦，主角主动出击查明关键线索，在关键节点果断出手，初露峥嵘。`,
      `主角深入关键区域获取重要情报与修炼机缘，意外撞破对手阴谋，冲突由此进一步升级。`
    ];
  } else if (ratio < 0.55) {
    titleList = [
      `步步为营与破局转机`,
      `夺宝交锋，重重杀机`,
      `暗度陈仓，实力精进`,
      `强敌插手，局势剧变`,
      `深入险境，绝密现世`,
      `连环杀局与临机应变`,
      `底蕴积累与境界突破`
    ];
    summaryList = [
      `剧情走向深水区，主角面对多方势力的围追堵截与暗中算计，巧妙运用智谋与实力步步为营，成功逆转不利态势。`,
      `围绕核心机缘与争端，各大势力正面交锋，主角在险恶环境中果断夺取关键造化，战力迎来阶段性飞跃。`,
      `危机关头主角识破对手陷阱，借力打力反制强敌，核心线索浮出水面，决战阴影悄然笼罩。`,
      `主角借助险地特殊环境苦修磨砺，融合全新神通底牌，战力实现质的突破，引发各方侧目。`
    ];
  } else if (ratio < 0.85) {
    titleList = [
      `强敌压境与生死博弈`,
      `绝处逢生，底牌尽出`,
      `决战爆发，天地变色`,
      `锋芒毕露，力挽狂澜`,
      `绝境逆伐，神威大展`,
      `杀招尽显，斩破死局`
    ];
    summaryList = [
      `本卷冲突迎来最高潮！最强敌手亲自出手压迫，生死存亡之际，主角底牌尽出正面迎敌，爆发惊天动地的大对决。`,
      `决战局势瞬息万变，主角在极限危机中洞悉破局之法，施展巅峰手段强力压制对手，掀起全场震撼。`,
      `正邪交锋进入白热化阶段，主角以雷霆手段打破僵局，将强敌逼入绝境，胜利天平彻底倾斜。`,
      `面对强敌的终极杀阵与绝命反扑，主角以无上意志逆风翻盘，施展至强杀招重创对手首脑。`
    ];
  } else {
    titleList = [
      `决胜诛敌，乾坤底定`,
      `横扫残敌，清点战利`,
      `实力跃迁，威震四方`,
      `新局初开，声名远扬`
    ];
    summaryList = [
      `大战迎来最终裁决，主角强势诛灭核心大敌，彻底粉碎对手图谋，震慑全场观战的各大势力。`,
      `高潮战事平息，主角收拢核心机缘与战利品，实力再次精进升华，受到各方由衷敬畏。`
    ];
  }

  const chosenTitle = titleList[chapOffsetInVol % titleList.length];
  const chosenSummary = summaryList[chapOffsetInVol % summaryList.length];

  return {
    title: `第${chapIndex}章 ${chosenTitle}`,
    summary: chosenSummary,
  };
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

  for (let c = 0; c < targetChapCount; c++) {
    const chapIndex = startChapNumber + c;
    const rawChap = existing[c];
    const fallbackInfo = generateContextualFallbackChapterData(chapIndex, c, targetChapCount, volNumber, volTitle);

    if (rawChap) {
      const rawTitle = rawChap.title ? String(rawChap.title).trim() : "";
      const normalizedTitle = rawTitle ? replaceChapterTitleNumber(rawTitle, chapIndex) : fallbackInfo.title;
      const normalizedSummary = rawChap.summary && !rawChap.summary.includes("本章紧密承接上文剧情发展")
        ? cleanSummary(rawChap.summary, fallbackInfo.summary)
        : fallbackInfo.summary;

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
      chapters.push({
        id: `chap-${Date.now()}-${volNumber}-${c}`,
        chapterNumber: chapIndex,
        title: fallbackInfo.title,
        summary: fallbackInfo.summary,
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
      volTitle = cleanVolumeTitle(rawVol.volumeTitle || rawVol.title, volNum);
      volSummary = cleanSummary(rawVol.summary, `本卷围绕核心冲突展开，剧情层层递进，将全书主线推向阶段性高潮。`);
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
 * 4. Volume titles and summaries are cleansed of any leftover JSON keys or artifacts.
 */
export function normalizeNovelChaptersAndTitles(volumes: Volume[]): Volume[] {
  let globalChapIndex = 1;

  return volumes.map((vol, vIdx) => {
    // Sort chapters in this volume first by effective chapter number
    const sortedChapters = sortChapters(vol.chapters);
    const volNum = vIdx + 1;
    const cleanVolTitle = cleanVolumeTitle(vol.volumeTitle, volNum);
    const cleanVolSummary = cleanSummary(vol.summary, `本卷围绕核心冲突展开，将全书剧情推向阶段性高潮。`);

    const reindexedChapters = sortedChapters.map((chap) => {
      const targetIndex = globalChapIndex++;
      const newTitle = replaceChapterTitleNumber(chap.title, targetIndex);
      const newSummary = cleanSummary(chap.summary, `本章剧情承上启下，推进核心冲突与看点。`);

      return {
        ...chap,
        chapterNumber: targetIndex,
        title: newTitle,
        summary: newSummary,
      };
    });

    return {
      ...vol,
      volumeNumber: volNum,
      volumeTitle: cleanVolTitle,
      summary: cleanVolSummary,
      chapters: reindexedChapters,
    };
  });
}

/**
 * Cleans the whole novel structure (title, logline, worldBuilding, characters, volumes, chapters)
 * from any rogue JSON formatting artifacts or English keys.
 */
export function sanitizeWholeNovel(novel: Novel): Novel {
  return {
    ...novel,
    title: cleanJsonArtifacts(novel.title) || '未命名小说',
    logline: cleanJsonArtifacts(novel.logline) || '',
    worldBuilding: {
      ...novel.worldBuilding,
      background: cleanJsonArtifacts(novel.worldBuilding?.background) || '',
      powerSystem: cleanJsonArtifacts(novel.worldBuilding?.powerSystem) || '',
      factions: cleanJsonArtifacts(novel.worldBuilding?.factions) || '',
    },
    characters: (novel.characters || []).map(char => ({
      ...char,
      name: cleanJsonArtifacts(char.name),
      role: cleanJsonArtifacts(char.role),
      description: cleanJsonArtifacts(char.description),
      background: cleanJsonArtifacts(char.background),
    })),
    volumes: normalizeNovelChaptersAndTitles(novel.volumes || []),
  };
}


