import React, { useState } from 'react';
import { Novel, WorldBuildingItem } from '../types';
import { Globe, Save, Check, Plus, Trash2 } from 'lucide-react';

interface WorldViewProps {
  novel: Novel;
  onUpdateNovel: (updated: Novel) => void;
}

export const WorldView: React.FC<WorldViewProps> = ({ novel, onUpdateNovel }) => {
  const [background, setBackground] = useState(novel.worldBuilding.background);
  const [powerSystem, setPowerSystem] = useState(novel.worldBuilding.powerSystem);
  const [factions, setFactions] = useState(novel.worldBuilding.factions);
  const [customItems, setCustomItems] = useState<WorldBuildingItem[]>(novel.worldBuilding.customItems || []);
  const [saved, setSaved] = useState(false);

  const handleAddCustomItem = () => {
    const newItem: WorldBuildingItem = {
      id: `wb-${Date.now()}`,
      title: '新自定义设定 (如：神兵利器 / 地理地图)',
      content: '在此输入详细的设定内容...',
    };
    setCustomItems([...customItems, newItem]);
  };

  const handleUpdateCustomItem = (id: string, field: 'title' | 'content', value: string) => {
    setCustomItems(
      customItems.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleDeleteCustomItem = (id: string) => {
    setCustomItems(customItems.filter((item) => item.id !== id));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: Novel = {
      ...novel,
      worldBuilding: {
        background,
        powerSystem,
        factions,
        customItems,
      },
      updatedAt: new Date().toISOString(),
    };
    onUpdateNovel(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-stone-200 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-900">世界观与设定集</h2>
            <p className="text-xs text-stone-500">完善小说的舞台背景、境界等级、主要势力以及自定义设定集</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handleAddCustomItem}
            className="inline-flex items-center px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium rounded-xl transition-colors space-x-1.5"
          >
            <Plus className="w-4 h-4 text-amber-600" />
            <span>添加自定义设定</span>
          </button>

          <button
            onClick={handleSave}
            className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors space-x-2"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4" />
                <span>已保存</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>保存设定</span>
              </>
            )}
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-stone-200 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-stone-900 flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
            <span>世界背景与核心舞台</span>
          </h3>
          <textarea
            rows={5}
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            placeholder="描述小说的时代背景、地理环境、核心矛盾或科技/灵气设定..."
            className="w-full rounded-xl border border-stone-300 p-4 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none leading-relaxed"
          />
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-stone-200 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-stone-900 flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
            <span>力量体系 / 等级划分</span>
          </h3>
          <textarea
            rows={5}
            value={powerSystem}
            onChange={(e) => setPowerSystem(e.target.value)}
            placeholder="描述主角及其他角色的实力等级、修炼方式或超凡能力体系..."
            className="w-full rounded-xl border border-stone-300 p-4 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none leading-relaxed"
          />
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-stone-200 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-stone-900 flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
            <span>势力分布 / 宗门国家</span>
          </h3>
          <textarea
            rows={5}
            value={factions}
            onChange={(e) => setFactions(e.target.value)}
            placeholder="描述主要组织、敌对势力、隐世家族等..."
            className="w-full rounded-xl border border-stone-300 p-4 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none leading-relaxed"
          />
        </div>

        {/* Custom WorldBuilding Items */}
        {customItems.map((item, index) => (
          <div key={item.id} className="bg-white p-6 sm:p-8 rounded-2xl border border-stone-200 shadow-xs space-y-4 relative group">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2 w-full max-w-md">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => handleUpdateCustomItem(item.id, 'title', e.target.value)}
                  placeholder="设定分类名称 (如：神兵利器、地理奇观)"
                  className="font-bold text-stone-900 bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5 text-sm w-full focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => handleDeleteCustomItem(item.id)}
                className="text-stone-400 hover:text-red-600 p-2 rounded-lg transition-colors"
                title="删除该自定义设定"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <textarea
              rows={4}
              value={item.content}
              onChange={(e) => handleUpdateCustomItem(item.id, 'content', e.target.value)}
              placeholder="在此输入该分类的详细设定、规则或条目..."
              className="w-full rounded-xl border border-stone-300 p-4 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none leading-relaxed"
            />
          </div>
        ))}

        <div className="flex justify-between items-center pt-2">
          <button
            type="button"
            onClick={handleAddCustomItem}
            className="inline-flex items-center px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium rounded-xl transition-colors space-x-2 border border-stone-200"
          >
            <Plus className="w-4 h-4 text-amber-600" />
            <span>添加自定义设定卡片</span>
          </button>

          <button
            type="submit"
            className="inline-flex items-center px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl shadow-md transition-colors space-x-2"
          >
            <Save className="w-5 h-5" />
            <span>保存世界观修改</span>
          </button>
        </div>
      </form>
    </div>
  );
};
