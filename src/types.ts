export interface Character {
  id: string;
  name: string;
  role: string; // 主角, 反派, 女主角, 导师, 黄金配角
  description: string;
  background: string;
}

export interface WorldBuildingItem {
  id: string;
  title: string;
  content: string;
}

export interface WorldBuilding {
  background: string;
  powerSystem: string;
  factions: string;
  customItems?: WorldBuildingItem[];
}

export interface Chapter {
  id: string;
  chapterNumber: number;
  title: string;
  summary: string;
  content: string;
  wordCount: number;
  status: 'draft' | 'completed' | 'reviewing';
}

export interface Volume {
  id: string;
  volumeNumber: number;
  volumeTitle: string;
  summary: string;
  chapters: Chapter[];
}

export interface Novel {
  id: string;
  title: string;
  logline: string;
  genre: string;
  tags: string[];
  targetLength: string;
  tone: string;
  worldBuilding: WorldBuilding;
  characters: Character[];
  volumes: Volume[];
  createdAt: string;
  updatedAt: string;
  chapterMinWords?: number;
  chapterMaxWords?: number;
}

export type TabType = 'dashboard' | 'world' | 'characters' | 'outline' | 'editor' | 'export' | 'bookshelf' | 'storage';
