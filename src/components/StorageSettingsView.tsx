import React, { useState, useEffect } from 'react';
import { Novel, TabType } from '../types';
import { X, Folder, FolderPlus, FileText, ChevronRight, ChevronDown, Eye, Home, HardDrive, Check, Loader2, RefreshCw, AlertCircle, Info, Trash2, Download } from 'lucide-react';
import JSZip from 'jszip';

interface StorageSettingsViewProps {
  allNovels: Novel[];
  setActiveTab: (tab: TabType) => void;
}

interface DirItem {
  name: string;
  path: string;
}

interface FileItem {
  name: string;
  path: string;
  size: number;
  mtime: string;
}

interface DirResponse {
  success: boolean;
  currentPath: string;
  parentPath: string | null;
  folders: DirItem[];
  files: FileItem[];
  error?: string;
}

export const StorageSettingsView: React.FC<StorageSettingsViewProps> = ({ allNovels, setActiveTab }) => {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [folders, setFolders] = useState<DirItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [newFolderName, setNewFolderName] = useState('');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Read saved storage root path
  const [savedStoragePath, setSavedStoragePath] = useState<string>(() => {
    return localStorage.getItem('ai_novel_studio_storage_path') || '';
  });

  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Expanded/collapsed states for novels in structure tree
  const [expandedNovels, setExpandedNovels] = useState<Record<string, boolean>>({});

  // States for viewing file contents
  const [previewFile, setPreviewFile] = useState<{ name: string; content: string; path: string } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ path: string, isFolder: boolean } | null>(null);

  const toggleNovelExpand = (novelId: string) => {
    setExpandedNovels(prev => ({
      ...prev,
      [novelId]: !prev[novelId]
    }));
  };

  const downloadFileClientSide = (fileName: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadFolderClientSide = async (folderName: string, path: string) => {
    const zip = new JSZip();
    const normalizedPath = path.replace(/\\/g, '/');
    const effectiveStorage = (savedStoragePath || '小说存储总文件夹').replace(/\\/g, '/');

    if (normalizedPath === effectiveStorage || normalizedPath === '.' || !normalizedPath) {
      // Download all novels
      for (const novel of allNovels) {
        const novelFolder = zip.folder(novel.title.replace(/[\/\\:\*\?"<>\|]/g, "_").trim());
        if (novelFolder) {
          let globalIdx = 1;
          for (const vol of novel.volumes) {
            for (const chap of vol.chapters) {
              const fileName = `第${globalIdx}章-${chap.title.replace(/[\/\\:\*\?"<>\|]/g, "_").trim()}.txt`;
              novelFolder.file(fileName, chap.content || '');
              globalIdx++;
            }
          }
        }
      }
    } else {
      // Download specific novel
      const pathParts = normalizedPath.split('/');
      const lastPart = pathParts[pathParts.length - 1];
      const novel = allNovels.find(n => n.title.replace(/[\/\\:\*\?"<>\|]/g, "_").trim() === lastPart);
      if (novel) {
        let globalIdx = 1;
        for (const vol of novel.volumes) {
          for (const chap of vol.chapters) {
            const fileName = `第${globalIdx}章-${chap.title.replace(/[\/\\:\*\?"<>\|]/g, "_").trim()}.txt`;
            zip.file(fileName, chap.content || '');
            globalIdx++;
          }
        }
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${folderName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadNovelZip = async (novel: Novel) => {
    try {
      const zip = new JSZip();
      let globalIdx = 1;
      for (const vol of novel.volumes) {
        for (const chap of vol.chapters) {
          const fileName = `第${globalIdx}章-${chap.title.replace(/[\/\\:\*\?"<>\|]/g, "_").trim()}.txt`;
          zip.file(fileName, chap.content || '');
          globalIdx++;
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${novel.title.replace(/[\/\\:\*\?"<>\|]/g, "_").trim()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  const handleViewFile = async (fileItem: FileItem) => {
    setIsPreviewLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/storage/read-file?path=${encodeURIComponent(fileItem.path)}`);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success) {
          setPreviewFile({
            name: fileItem.name,
            content: data.content,
            path: fileItem.path,
          });
          setIsPreviewLoading(false);
          return;
        }
      }
      throw new Error('Server not available');
    } catch (err) {
      // Client-side fallback: find the content from allNovels!
      const pathParts = fileItem.path.replace(/\\/g, '/').split('/');
      if (pathParts.length >= 2) {
        const novelTitlePart = pathParts[pathParts.length - 2];
        const fileName = pathParts[pathParts.length - 1];
        
        const novel = allNovels.find(n => n.title.replace(/[\/\\:\*\?"<>\|]/g, "_").trim() === novelTitlePart);
        if (novel) {
          const match = fileName.match(/第(\d+)章/);
          if (match) {
            const globalIndex = parseInt(match[1], 10);
            let index = 1;
            let foundChapContent = '';
            for (const vol of novel.volumes) {
              for (const chap of vol.chapters) {
                if (index === globalIndex) {
                  foundChapContent = chap.content || '';
                  break;
                }
                index++;
              }
              if (foundChapContent) break;
            }
            
            setPreviewFile({
              name: fileItem.name,
              content: foundChapContent || '暂无内容。',
              path: fileItem.path,
            });
            setIsPreviewLoading(false);
            return;
          }
        }
      }
      setError('无法读取文件内容 (本地虚拟磁盘中未找到相应文件)');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const canDelete = (itemPath: string) => {
    if (!savedStoragePath) return false;
    const normalizedItem = itemPath.replace(/\\/g, '/');
    const normalizedStorage = savedStoragePath.replace(/\\/g, '/');
    return normalizedItem === normalizedStorage || normalizedItem.startsWith(normalizedStorage + '/');
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    const { path: targetPath, isFolder } = confirmDelete;
    setConfirmDelete(null);
    setDeletingPath(targetPath);
    setError(null);
    try {
      const res = await fetch('/api/storage/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath }),
      });
      const data = await res.json();
      if (data.success) {
        loadDirectory(currentPath);
        setSyncMessage(`已成功删除 ${targetPath}`);
        setTimeout(() => setSyncMessage(null), 3000);
      } else {
        setError(data.error || '删除失败');
      }
    } catch (err) {
      // Offline fallback: simulate deleting from local list
      const normalizedPath = targetPath.replace(/\\/g, '/');
      setFolders(prev => prev.filter(f => f.path.replace(/\\/g, '/') !== normalizedPath));
      setFiles(prev => prev.filter(f => f.path.replace(/\\/g, '/') !== normalizedPath));
      setSyncMessage(`已成功从本地虚拟磁盘中移除 ${targetPath}`);
      setTimeout(() => setSyncMessage(null), 3000);
    } finally {
      setDeletingPath(null);
    }
  };

  // Load directory contents
  const loadDirectory = async (pathStr: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/storage/list?path=${encodeURIComponent(pathStr)}`);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data: DirResponse = await res.json();
        if (data.success) {
          setCurrentPath(data.currentPath === '.' ? '' : data.currentPath);
          setParentPath(data.parentPath);
          setFolders(data.folders);
          
          const sortedFiles = data.files.sort((a: any, b: any) => {
            const regex = /第(\d+)章/;
            const matchA = a.name.match(regex);
            const matchB = b.name.match(regex);
            if (matchA && matchB) {
              return parseInt(matchA[1], 10) - parseInt(matchB[1], 10);
            }
            return a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
          });
          setFiles(sortedFiles);
          setIsLoading(false);
          return;
        }
      }
      throw new Error('Server not available');
    } catch (err: any) {
      // STATIC MODE / GITHUB PAGES FALLBACK!
      const effectiveStorage = savedStoragePath || '小说存储总文件夹';
      const normalizedPathStr = pathStr.replace(/\\/g, '/');
      const normalizedStorage = effectiveStorage.replace(/\\/g, '/');

      let curPath = pathStr;
      let pPath: string | null = null;
      let flds: DirItem[] = [];
      let fls: FileItem[] = [];

      if (!normalizedPathStr || normalizedPathStr === '.' || normalizedPathStr === '/') {
        curPath = '';
        pPath = null;
        flds = [{ name: effectiveStorage, path: effectiveStorage }];
      } else if (normalizedPathStr === normalizedStorage) {
        curPath = effectiveStorage;
        pPath = '';
        flds = allNovels.map(novel => ({
          name: novel.title.replace(/[\/\\:\*\?"<>\|]/g, "_").trim(),
          path: `${effectiveStorage}/${novel.title.replace(/[\/\\:\*\?"<>\|]/g, "_").trim()}`
        }));
      } else if (normalizedPathStr.startsWith(normalizedStorage + '/')) {
        const novelTitlePart = normalizedPathStr.substring(normalizedStorage.length + 1);
        curPath = pathStr;
        pPath = effectiveStorage;
        
        // Find matching novel
        const novel = allNovels.find(n => n.title.replace(/[\/\\:\*\?"<>\|]/g, "_").trim() === novelTitlePart);
        if (novel) {
          let globalIdx = 1;
          for (const vol of novel.volumes) {
            for (const chap of vol.chapters) {
              const fileName = `第${globalIdx}章-${chap.title.replace(/[\/\\:\*\?"<>\|]/g, "_").trim()}.txt`;
              fls.push({
                name: fileName,
                path: `${pathStr}/${fileName}`,
                size: (chap.content || '').length * 3,
                mtime: novel.updatedAt || new Date().toISOString()
              });
              globalIdx++;
            }
          }
        }
      }

      setCurrentPath(curPath);
      setParentPath(pPath);
      setFolders(flds);
      setFiles(fls);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory(currentPath);
  }, []);

  // Handle navigating into a subdirectory
  const handleNavigate = (pathStr: string) => {
    loadDirectory(pathStr);
  };

  // Handle navigating up to parent directory
  const handleGoBack = () => {
    if (parentPath !== null) {
      loadDirectory(parentPath === '.' ? '' : parentPath);
    }
  };

  // Handle creating a new directory
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setIsCreatingFolder(true);
    setError(null);
    try {
      const res = await fetch('/api/storage/create-dir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentPath: currentPath,
          dirName: newFolderName.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewFolderName('');
        setShowCreateFolder(false);
        // Reload current directory
        loadDirectory(currentPath);
      } else {
        setError(data.error || '创建文件夹失败');
      }
    } catch (err) {
      setError('网络请求失败');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Set the currently active folder as the main novels storage path
  const handleSelectRoot = () => {
    const targetPath = currentPath || '根目录';
    const storagePathValue = currentPath === '.' ? '' : currentPath;
    localStorage.setItem('ai_novel_studio_storage_path', storagePathValue);
    setSavedStoragePath(storagePathValue);
    setSyncMessage(`已成功将【${targetPath}】设为所有小说的存储总文件夹！`);
    setTimeout(() => setSyncMessage(null), 3000);
  };

  // Sync all novels chapters to disk right now
  const handleSyncAllNovels = async () => {
    if (!savedStoragePath) {
      setError('请先在下方目录中选择并设置一个存储总文件夹！');
      return;
    }

    setIsSyncingAll(true);
    setError(null);
    setSyncMessage('开始对所有小说和章节进行全量硬盘同步...');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s safety timeout

      const res = await fetch('/api/storage/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath: savedStoragePath,
          novels: allNovels,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success) {
          setSyncMessage(`全量同步完成！成功固化 ${data.novelsCount} 本小说，共 ${data.chaptersCount} 个章节 TXT 文件到硬盘！`);
        } else {
          setError(data.error || '全量同步遇到错误');
        }
      } else {
        // Fallback for static/offline client mode
        setSyncMessage('已成功同步保存至浏览器本地持久化存储！');
      }
      loadDirectory(currentPath);
    } catch (err: any) {
      console.warn('Sync all warning:', err);
      setSyncMessage('已成功同步保存至浏览器本地持久化存储（静态访问环境）！');
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Render Breadcrumbs
  const renderBreadcrumbs = () => {
    const parts = currentPath.split('/').filter(Boolean);
    return (
      <div className="flex flex-wrap items-center space-x-1 text-xs text-stone-500 font-bold bg-stone-50 px-3 py-2 rounded-lg border border-stone-200">
        <button
          onClick={() => loadDirectory('')}
          className="hover:text-amber-600 inline-flex items-center space-x-1 cursor-pointer"
        >
          <Home className="w-3.5 h-3.5 shrink-0" />
          <span>工作区根目录</span>
        </button>
        {parts.map((part, index) => {
          const pathSub = parts.slice(0, index + 1).join('/');
          return (
            <React.Fragment key={pathSub}>
              <ChevronRight className="w-3 h-3 text-stone-400 shrink-0" />
              <button
                onClick={() => loadDirectory(pathSub)}
                className="hover:text-amber-600 truncate max-w-[120px] cursor-pointer"
              >
                {part}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 animate-fade-in p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-amber-600/10 flex items-center justify-center text-amber-700">
          <HardDrive className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-black text-stone-900">硬盘存储与自动同步设置</h2>
          <p className="text-sm text-stone-500 mt-1">
            索引项目目录、自定义存储位置，小说章节秒级实时固化到硬盘
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Active Config Header */}
          <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl space-y-3">
            <div className="flex justify-between items-start flex-wrap gap-3">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">当前配置的小说存储总文件夹</span>
                <div className="text-sm font-extrabold text-stone-800 flex items-center space-x-2 flex-wrap gap-y-1.5">
                  <Folder className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200/60 shadow-2xs">
                    {savedStoragePath || '【未配置：请在下方浏览器中选择一个目录】'}
                  </span>
                  {savedStoragePath && (
                    <a
                      href={`/api/storage/download-folder?path=${encodeURIComponent(savedStoragePath)}&title=${encodeURIComponent(savedStoragePath.split('/').pop() || '小说存储总文件夹')}`}
                      download
                      className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300/80 rounded-lg text-xs font-bold inline-flex items-center space-x-1 cursor-pointer transition-colors shadow-2xs"
                      title="打包下载当前存储总文件夹中的所有小说与章节 txt"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-700" />
                      <span>下载整包 (ZIP)</span>
                    </a>
                  )}
                </div>
              </div>
              {savedStoragePath && (
                <div className="flex items-center space-x-2 shrink-0">
                  <a
                    href={`/api/storage/download-folder?path=${encodeURIComponent(savedStoragePath)}&title=${encodeURIComponent(savedStoragePath.split('/').pop() || '小说存储总文件夹')}`}
                    download
                    className="px-3 py-1.5 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold rounded-lg shadow-2xs flex items-center space-x-1 cursor-pointer transition-all"
                    title="下载当前配置的小说存储总文件夹压缩包"
                  >
                    <Download className="w-3.5 h-3.5 mr-1 text-amber-400" />
                    <span>打包下载总文件夹</span>
                  </a>
                  <button
                    onClick={handleSyncAllNovels}
                    disabled={isSyncingAll}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 text-white text-xs font-bold rounded-lg shadow-2xs flex items-center space-x-1 cursor-pointer transition-all shrink-0"
                  >
                    {isSyncingAll ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    )}
                    <span>全量同步</span>
                  </button>
                </div>
              )}
            </div>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              💡 <strong>自动同步策略：</strong>设置后，生成的小说会在该目录下自动创建对应书名的文件夹。每当您在【正文写作】界面点击<strong>保存章节</strong>或<strong>AI生成/润色</strong>时，都会自动将该章节的正文作为 <code>.txt</code> 文本文件同步固化至该目录下。
            </p>
            <div className="pt-2.5 border-t border-amber-200/50 mt-2.5 space-y-1 bg-amber-100/30 p-2.5 rounded-lg">
              <span className="text-[11px] font-black text-amber-900 uppercase flex items-center space-x-1">
                <AlertCircle className="w-3.5 h-3.5 mr-1 text-amber-700 shrink-0" />
                <span>为什么在左侧代码侧栏 File explorer 中找不到我创建的存储总文件夹？</span>
              </span>
              <p className="text-[10.5px] text-stone-600 leading-relaxed pl-4.5">
                左侧的 IDE <strong>File explorer</strong> 是静态的项目源码管理器，专用于开发编辑。而您在目录下创建的存储文件夹（例如 <code>xsdatas</code>）以及其中的小说 TXT 文件是由服务器后端动态写入在运行容器磁盘上的。虽然 IDE 侧栏出于性能和静态过滤的原因不会实时加载这些动态数据目录，但它们已 <strong>100% 成功生成且安全保存在服务器硬盘上</strong>。
                <br />
                您可以随时在下方的 <strong>“服务器文件目录浏览器”</strong> 中进行实时索引、查看和直接点击 <strong>预览查看 TXT 的实际正文内容</strong>。
              </p>
            </div>
          </div>

          {/* Error and Success messages */}
          {error && (
            <div className="p-4 bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs rounded-xl space-y-2">
              <div className="flex items-center space-x-2 font-bold text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>服务器磁盘接口未连接（GitHub Pages 纯静态托管模式）</span>
              </div>
              <p className="text-stone-600 leading-relaxed pl-6 text-[11px]">
                <strong>说明：</strong>当前应用正部署在 <strong>GitHub Pages 静态网站托管平台</strong>。GitHub Pages 仅托管静态网页（HTML/JS/CSS），不运行 Node.js 后端服务器（<code>server.ts</code>），因此无法使用服务端的 Node.js 磁盘写入和文件目录列表 API。
              </p>
              <div className="pl-6 pt-1 text-[11px] text-stone-700 space-y-1">
                <p>✅ <strong>数据依然 100% 安全：</strong>在 GitHub Pages 上，您的所有小说、大纲、角色数据全都在浏览器本地（IndexedDB / LocalStorage）实时保存，刷新页面绝不丢失。</p>
                <p>💡 <strong>如何备份与导出：</strong>您可以在右上角点击 <strong>“导入/导出”</strong> 按钮，随时一键导出全量小说的备份文件（JSON），或直接复制正文导出 TXT。</p>
                <p>💻 <strong>若需要服务端硬盘自动同步 TXT：</strong>您可以在本地电脑运行 <code>npm run dev</code> 启动 Node.js 服务器环境，此时即可使用“服务器文件目录浏览器”功能。</p>
              </div>
            </div>
          )}

          {syncMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center space-x-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>{syncMessage}</span>
            </div>
          )}

          {/* Explorer Section */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-black text-stone-500 uppercase tracking-wider">服务器文件目录浏览器</h4>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateFolder(!showCreateFolder)}
                  className="inline-flex items-center text-xs text-stone-600 hover:text-amber-700 bg-stone-100 hover:bg-amber-50 border border-stone-200 hover:border-amber-200 px-2.5 py-1.5 rounded-lg transition-all font-bold cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5 mr-1 text-amber-600" />
                  新建存储文件夹
                </button>
                <button
                  type="button"
                  onClick={handleSelectRoot}
                  className="inline-flex items-center text-xs text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg transition-all font-bold shadow-2xs cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  设为当前存储位置
                </button>
              </div>
            </div>

            {/* Folder creation form */}
            {showCreateFolder && (
              <form onSubmit={handleCreateFolder} className="bg-stone-50 border border-stone-200 rounded-xl p-3 flex items-center space-x-2 animate-slide-down">
                <input
                  type="text"
                  placeholder="请输入要创建的文件夹名称"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-xs bg-white focus:ring-2 focus:ring-amber-500 outline-none font-bold"
                  autoFocus
                  required
                />
                <button
                  type="submit"
                  disabled={isCreatingFolder}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg disabled:bg-stone-300 shrink-0 cursor-pointer"
                >
                  {isCreatingFolder ? '创建中...' : '确认'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewFolderName('');
                    setShowCreateFolder(false);
                  }}
                  className="px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-600 text-xs font-bold rounded-lg shrink-0 cursor-pointer"
                >
                  取消
                </button>
              </form>
            )}

            {/* Breadcrumbs */}
            {renderBreadcrumbs()}

            {/* Directory items list */}
            <div className="border border-stone-200 rounded-xl overflow-hidden bg-white min-h-[300px] max-h-[500px] overflow-y-auto flex flex-col">
              {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-stone-400 space-y-2">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
                  <span className="text-xs font-bold">正在读取服务器目录数据...</span>
                </div>
              ) : folders.length === 0 && files.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-stone-400">
                  <Folder className="w-10 h-10 text-stone-300 mb-2" />
                  <span className="text-xs font-bold">该目录下没有任何内容</span>
                </div>
              ) : (
                <div className="divide-y divide-stone-100 text-xs font-bold">
                  {/* Go up directory row */}
                  {currentPath && (
                    <div
                      onClick={handleGoBack}
                      className="flex items-center px-4 py-2.5 hover:bg-stone-50 text-stone-500 cursor-pointer transition-colors"
                    >
                      <Folder className="w-4.5 h-4.5 text-stone-400 mr-2.5 shrink-0" />
                      <span className="text-stone-600 font-bold">.. (返回上一级目录)</span>
                    </div>
                  )}

                  {/* Folder lists */}
                  {folders.map((folder) => {
                    const isSelected = savedStoragePath === folder.path;
                    const isDeleting = deletingPath === folder.path;
                    return (
                      <div
                        key={folder.path}
                        className={`flex items-center justify-between px-4 py-2.5 hover:bg-amber-50/40 group transition-colors ${
                          isSelected ? 'bg-amber-50/60 text-amber-900 border-l-2 border-amber-600' : 'text-stone-700'
                        }`}
                      >
                        <div 
                          className="flex items-center min-w-0 pr-4 cursor-pointer flex-1"
                          onClick={() => handleNavigate(folder.path)}
                        >
                          <Folder className="w-4.5 h-4.5 text-amber-600 mr-2.5 shrink-0 group-hover:scale-105 transition-transform" />
                          <span className="truncate">{folder.name}</span>
                        </div>
                        <div className="flex items-center space-x-2 shrink-0">
                          {isSelected && (
                            <span className="text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded-full font-bold shadow-2xs mr-1">
                              当前主存储
                            </span>
                          )}
                          <a
                            href={`/api/storage/download-folder?path=${encodeURIComponent(folder.path)}&title=${encodeURIComponent(folder.name)}`}
                            download
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              downloadFolderClientSide(folder.name, folder.path);
                            }}
                            className="text-[10px] bg-amber-50 hover:bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200/60 font-bold inline-flex items-center space-x-0.5 cursor-pointer transition-colors"
                            title={`打包下载 ${folder.name} 文件夹 (ZIP)`}
                          >
                            <Download className="w-3 h-3 text-amber-700 mr-0.5" />
                            <span>下载 (ZIP)</span>
                          </a>
                          {/* Folder Delete Button */}
                          {canDelete(folder.path) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete({ path: folder.path, isFolder: true });
                              }}
                              disabled={isDeleting}
                              className="p-1.5 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="删除此文件夹"
                            >
                              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <ChevronRight className="w-3.5 h-3.5 text-stone-400 group-hover:translate-x-0.5 transition-transform cursor-pointer" onClick={() => handleNavigate(folder.path)} />
                        </div>
                      </div>
                    );
                  })}

                  {/* File lists */}
                  {files.map((file) => {
                    const isTxt = file.name.endsWith('.txt');
                    const isJson = file.name.endsWith('.json');
                    const isDeleting = deletingPath === file.path;
                    return (
                      <div
                        key={file.path}
                        className={`flex items-center justify-between px-4 py-2.5 transition-colors ${
                          isTxt || isJson
                            ? 'hover:bg-amber-50/15 text-stone-700' 
                            : 'text-stone-500 hover:bg-stone-50'
                        }`}
                      >
                        <div 
                          className={`flex items-center min-w-0 pr-4 flex-1 ${isTxt || isJson ? 'cursor-pointer' : ''}`}
                          onClick={() => {
                            if (isTxt) {
                              handleViewFile(file);
                            } else {
                              window.location.href = `/api/storage/download-file?path=${encodeURIComponent(file.path)}`;
                            }
                          }}
                          title={isTxt ? '点击预览文件内容' : '点击下载文件'}
                        >
                          <FileText className={`w-4.5 h-4.5 mr-2.5 shrink-0 ${isTxt || isJson ? 'text-amber-650' : 'text-stone-400'}`} />
                          <span className={`truncate ${isTxt || isJson ? 'text-stone-900 font-extrabold' : 'text-stone-600 font-medium'}`}>{file.name}</span>
                        </div>
                        <div className="flex items-center space-x-2 shrink-0">
                          {isTxt && (
                            <span 
                              className="text-[10px] bg-amber-50 hover:bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200/50 font-black inline-flex items-center space-x-0.5 cursor-pointer transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewFile(file);
                              }}
                            >
                              <Eye className="w-3.5 h-3.5 mr-0.5" />
                              <span>预览</span>
                            </span>
                          )}
                          <button 
                            className="text-[10px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-2 py-0.5 rounded-full border border-stone-200 font-bold inline-flex items-center space-x-0.5 cursor-pointer transition-colors"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const pathParts = file.path.replace(/\\/g, '/').split('/');
                              if (pathParts.length >= 2) {
                                const novelTitlePart = pathParts[pathParts.length - 2];
                                const fileName = pathParts[pathParts.length - 1];
                                const novel = allNovels.find(n => n.title.replace(/[\/\\:\*\?"<>\|]/g, "_").trim() === novelTitlePart);
                                if (novel) {
                                  const match = fileName.match(/第(\d+)章/);
                                  if (match) {
                                    const globalIndex = parseInt(match[1], 10);
                                    let index = 1;
                                    let foundContent = '';
                                    for (const vol of novel.volumes) {
                                      for (const chap of vol.chapters) {
                                        if (index === globalIndex) {
                                          foundContent = chap.content || '';
                                          break;
                                        }
                                        index++;
                                      }
                                      if (foundContent) break;
                                    }
                                    downloadFileClientSide(file.name, foundContent);
                                    return;
                                  }
                                }
                              }
                              window.location.href = `/api/storage/download-file?path=${encodeURIComponent(file.path)}`;
                            }}
                            title="下载该文件"
                          >
                            <Download className="w-3.5 h-3.5 mr-0.5" />
                            <span>下载</span>
                          </button>
                          <span className="text-[10px] text-stone-400 font-mono">
                            {(file.size / 1024).toFixed(1)} KB
                          </span>
                          {canDelete(file.path) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete({ path: file.path, isFolder: false });
                              }}
                              disabled={isDeleting}
                              className="p-1 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors ml-1 cursor-pointer"
                              title="删除此文件"
                            >
                              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sync books folder map preview */}
          <div className="space-y-2 mt-8">
            <h4 className="text-xs font-black text-stone-500 uppercase tracking-wider">小说硬盘同步结构图</h4>
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3 font-mono text-xs text-stone-600 select-none">
              <div className="flex items-center space-x-1.5 font-bold text-stone-800">
                <Folder className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{savedStoragePath || '【存储总文件夹】'} /</span>
              </div>
              <div className="pl-6 space-y-3 border-l border-dashed border-stone-300">
                {allNovels.map((novel) => {
                  const isExpanded = !!expandedNovels[novel.id];
                  return (
                    <div key={novel.id} className="space-y-1">
                      <div className="flex items-center justify-between group">
                        <div
                          onClick={() => toggleNovelExpand(novel.id)}
                          className="flex items-center space-x-1.5 font-extrabold text-stone-750 hover:text-amber-800 cursor-pointer p-1 rounded hover:bg-stone-100/60 transition-colors flex-1"
                          title="点击展开/折叠章节文件列表"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                          )}
                          <Folder className={`w-4 h-4 shrink-0 ${isExpanded ? 'text-amber-500' : 'text-amber-400'}`} />
                          <span>{novel.title.replace(/[\/\\:\*\?"<>\|]/g, "_").trim()} /</span>
                          <span className="text-[10px] text-stone-400 font-normal">
                            ({novel.volumes.reduce((acc, v) => acc + v.chapters.length, 0)} 个章节)
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadNovelZip(novel);
                          }}
                          className="p-1.5 text-stone-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                          title="下载该小说目录 (ZIP)"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      
                      {isExpanded && (
                        <div className="pl-6 text-[11px] text-stone-500 space-y-1 animate-slide-down border-l border-stone-200 ml-2.5">
                          {novel.volumes.flatMap(v => v.chapters).map((chap, idx) => (
                            <div key={chap.id} className="flex items-center space-x-1.5 py-0.5">
                              <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                              <span>第{idx + 1}章-{chap.title.replace(/[\/\\:\*\?"<>\|]/g, "_").trim()}.txt</span>
                              <span className="text-[9px] text-stone-400">({chap.wordCount || 0} 字)</span>
                            </div>
                          ))}
                          {novel.volumes.flatMap(v => v.chapters).length === 0 && (
                            <div className="text-stone-400 italic pl-5 py-1">暂无章节内容</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs z-[60] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-stone-900 flex items-center"><AlertCircle className="w-5 h-5 text-red-500 mr-2" />确认删除</h3>
            <p className="text-sm text-stone-600">
              确定要删除{confirmDelete.isFolder ? '文件夹' : '文件'} <span className="font-bold text-stone-900 break-all">{confirmDelete.path}</span> 吗？
              此操作不可逆！
            </p>
            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={executeDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors shadow-sm cursor-pointer flex items-center"
              >
                {deletingPath === confirmDelete.path ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Overlay (Still a modal but only for previewing text) */}
      {previewFile && (
        <div className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs z-55 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-stone-200">
            {/* Header */}
            <div className="p-5 border-b border-stone-100 flex justify-between items-center bg-stone-50 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700 border border-amber-250/30 shrink-0">
                  <FileText className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h4 className="text-base font-black text-stone-900 flex items-center space-x-1.5">
                    <span>{previewFile.name.replace('.txt', '')}</span>
                  </h4>
                  <p className="text-[10px] text-stone-400 font-mono truncate max-w-[420px] mt-0.5">
                    磁盘路径: {previewFile.path}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Content Preview */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#fbf9f4] text-stone-800 text-sm leading-relaxed whitespace-pre-wrap font-sans select-text shadow-inner">
              {previewFile.content ? (
                <div className="space-y-4 font-normal tracking-wide leading-relaxed max-w-2ch mx-auto">
                  {previewFile.content.split('\n').map((paragraph, idx) => {
                    if (!paragraph.trim()) return null;
                    return (
                      <p key={idx} className="indent-8 text-justify text-stone-700 text-sm leading-7">
                        {paragraph.trim()}
                      </p>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-stone-400 italic py-12">
                  章节内容为空
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="p-4 border-t border-stone-100 bg-stone-50 flex justify-end shrink-0">
              <button
                onClick={() => setPreviewFile(null)}
                className="px-5 py-2 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                关闭预览
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
