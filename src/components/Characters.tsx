import React, { useState } from 'react';
import { Novel, Character } from '../types';
import { Users, Plus, Trash2, Edit2, X, Save, Sparkles } from 'lucide-react';

interface CharactersProps {
  novel: Novel;
  onUpdateNovel: (updated: Novel) => void;
}

export const Characters: React.FC<CharactersProps> = ({ novel, onUpdateNovel }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('主角');
  const [description, setDescription] = useState('');
  const [background, setBackground] = useState('');

  const handleOpenAdd = () => {
    setEditingId(null);
    setName('');
    setRole('主角');
    setDescription('');
    setBackground('');
    setIsEditing(true);
  };

  const handleOpenEdit = (char: Character) => {
    setEditingId(char.id);
    setName(char.name);
    setRole(char.role);
    setDescription(char.description);
    setBackground(char.background);
    setIsEditing(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    let updatedCharacters = [...novel.characters];
    if (editingId) {
      updatedCharacters = updatedCharacters.map((c) =>
        c.id === editingId ? { ...c, name, role, description, background } : c
      );
    } else {
      const newChar: Character = {
        id: `char-${Date.now()}`,
        name,
        role,
        description,
        background,
      };
      updatedCharacters.push(newChar);
    }

    const updatedNovel: Novel = {
      ...novel,
      characters: updatedCharacters,
      updatedAt: new Date().toISOString(),
    };

    onUpdateNovel(updatedNovel);
    setIsEditing(false);
  };

  const handleDelete = (id: string) => {
    const updatedNovel: Novel = {
      ...novel,
      characters: novel.characters.filter((c) => c.id !== id),
      updatedAt: new Date().toISOString(),
    };
    onUpdateNovel(updatedNovel);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-stone-200 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-900">登场角色管理</h2>
            <p className="text-xs text-stone-500">管理主角、反派与主要配角的生平、性格与人物弧光</p>
          </div>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>添加新角色</span>
        </button>
      </div>

      {/* Characters Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {novel.characters.map((char) => (
          <div
            key={char.id}
            className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow relative group"
          >
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/60">
                    {char.role}
                  </span>
                  <h3 className="text-xl font-bold text-stone-900 mt-2">{char.name}</h3>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleOpenEdit(char)}
                    className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg"
                    title="编辑"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(char.id)}
                    className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">外貌与性格</p>
                <p className="text-sm text-stone-700 leading-relaxed">{char.description}</p>
              </div>

              <div>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">背景与动机</p>
                <p className="text-sm text-stone-600 leading-relaxed">{char.background}</p>
              </div>
            </div>
          </div>
        ))}

        {novel.characters.length === 0 && (
          <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-stone-200">
            <Users className="w-12 h-12 text-stone-300 mx-auto mb-3" />
            <p className="text-stone-600 font-medium">暂无角色记录</p>
            <p className="text-xs text-stone-400 mt-1">点击上方按钮添加您的第一个小说角色</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-stone-900">
                {editingId ? '编辑角色设定' : '添加新角色'}
              </h3>
              <button
                onClick={() => setIsEditing(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  角色姓名
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如: 林渊"
                  className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  角色定位 (Role)
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="例如: 男主角 / 反派宗主 / 女主角"
                  className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  外貌与性格特点
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="描述外貌特征、衣着、性格及标志性口头禅或习惯..."
                  className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  身世背景与核心动机
                </label>
                <textarea
                  rows={3}
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  placeholder="描述身世经历、卷入主线的原因或核心愿望..."
                  className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 border border-stone-300 rounded-xl text-stone-700 text-sm font-medium hover:bg-stone-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium shadow-sm"
                >
                  保存角色
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
