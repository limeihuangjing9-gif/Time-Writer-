import React, { useState, useEffect } from 'react';
import { Novel } from '../types';
import { Plus, Trash2, ChevronRight, ArrowUpDown, Check, Settings, Pin, PinOff, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ShelfProps {
  novels: Novel[];
  onSelectNovel: (id: string) => void;
  onAddNovel: (title: string) => void;
  onDeleteNovel: (ids: Set<string>) => void;
  onSwapNovels: (idxA: number, idxB: number) => void;
  onTogglePin: (id: string) => void;
  onUpdateNovelTitle: (id: string, newTitle: string) => void;
}

export default function Shelf({ novels, onSelectNovel, onAddNovel, onDeleteNovel, onSwapNovels, onTogglePin, onUpdateNovelTitle }: ShelfProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [renameTarget, setRenameTarget] = useState<{id: string, title: string} | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [swapSelectedIdx, setSwapSelectedIdx] = useState<number | null>(null);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [pickupData, setPickupData] = useState<{quote: string, novelTitle: string, episodeTitle: string} | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (novels.length > 0) {
      const candidates: {quote: string, novelTitle: string, episodeTitle: string}[] = [];
      novels.forEach(n => {
        if (!n || !Array.isArray(n.episodes)) return;
        n.episodes.forEach(e => {
          if (!e.content) return;
          const rawSentences = e.content.split(/([。！？\n])/);
          const sentences: string[] = [];
          for (let i = 0; i < rawSentences.length; i += 2) {
            const s = (rawSentences[i] || '').trim();
            const p = rawSentences[i+1] || '';
            if (s.length > 5) sentences.push(s + p);
          }
          sentences.forEach(s => {
            candidates.push({ quote: s, novelTitle: n.title, episodeTitle: e.title });
          });
        });
      });
      if (candidates.length > 0) {
        const randomItem = candidates[Math.floor(Math.random() * candidates.length)];
        setPickupData(randomItem);
      }
    }
  }, [novels]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTitle.trim()) {
      onAddNovel(newTitle.trim());
      setNewTitle('');
      setIsModalOpen(false);
    }
  };

  const handleItemClick = (novelId: string, index: number, title: string) => {
    if (editMode) {
      setRenameTarget({ id: novelId, title });
      return;
    }
    if (deleteMode) {
      const next = new Set(selectedIds);
      if (next.has(novelId)) next.delete(novelId);
      else next.add(novelId);
      setSelectedIds(next);
      return;
    }

    if (reorderMode) {
      if (swapSelectedIdx === null) {
        setSwapSelectedIdx(index);
      } else {
        if (swapSelectedIdx !== index) {
          onSwapNovels(swapSelectedIdx, index);
        }
        setSwapSelectedIdx(null);
      }
    } else {
      onSelectNovel(novelId);
    }
  };

  const executeDelete = () => {
    onDeleteNovel(selectedIds);
    setSelectedIds(new Set());
    setDeleteMode(false);
    setIsDeleteConfirmOpen(false);
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 pt-6 sm:pt-8 animate-fade-in relative z-10">
      <header className="mb-4 flex justify-between items-start relative z-30">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex flex-[0_0_auto] flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 relative">
          <div className="flex items-baseline relative">
            <span className="font-sans italic pr-1">Time<span className="text-indigo-500">×</span>Writer</span>
            <span className="text-[10px] font-mono text-neutral-500 absolute -right-6 -bottom-1">v1.0</span>
          </div>
          <span className="text-sm sm:text-base font-serif font-bold text-neutral-400 sm:ml-4">タイム×ライター</span>
        </h1>
        <div className="relative">
          {!deleteMode && (
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-neutral-400 hover:bg-white/10 hover:text-white transition-colors">
              <Settings size={20} />
            </button>
          )}

          {deleteMode && (
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={() => setDeleteMode(false)}
                className="px-4 h-10 bg-white/5 text-neutral-400 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/10"
              >
                キャンセル
              </button>
              <button 
                type="button"
                onClick={() => selectedIds.size > 0 && setIsDeleteConfirmOpen(true)}
                disabled={selectedIds.size === 0}
                className={`px-4 h-10 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${selectedIds.size > 0 ? 'bg-red-600 text-white shadow-lg cursor-pointer' : 'bg-red-600/20 text-red-600/50 cursor-not-allowed'}`}
              >
                削除 ({selectedIds.size})
              </button>
            </div>
          )}
          
          <AnimatePresence>
            {isMenuOpen && !deleteMode && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                <motion.div 
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className="absolute right-0 top-12 w-52 bg-[#111111] border border-[#333333] rounded-2xl shadow-xl shadow-black/50 z-50 overflow-hidden flex flex-col py-1"
                >
                  <button 
                    onClick={() => { setIsModalOpen(true); setIsMenuOpen(false); setEditMode(false); }}
                    className="flex text-left items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-200 hover:bg-white/10 transition-colors"
                  >
                    <Plus size={16} className="text-white" strokeWidth={3} />
                    新規プロジェクト
                  </button>
                  <button 
                    onClick={() => { setEditMode(!editMode); setIsMenuOpen(false); setReorderMode(false); setDeleteMode(false); }}
                    className={`flex text-left items-center gap-3 px-4 py-3 text-sm font-bold transition-colors ${editMode ? 'bg-indigo-500/20 text-indigo-400' : 'text-neutral-300 hover:bg-white/10'}`}
                  >
                    <Edit2 size={16} className={editMode ? 'text-indigo-400' : 'text-white'} strokeWidth={3} />
                    現在のプロジェクト名を変更
                  </button>
                  <div className="h-[1px] w-full bg-[#222222] my-1" />
                  <button 
                    onClick={() => { setReorderMode(!reorderMode); setIsMenuOpen(false); setSwapSelectedIdx(null); setDeleteMode(false); setEditMode(false); }}
                    className={`flex text-left items-center gap-3 px-4 py-3 text-sm font-bold transition-colors ${reorderMode ? 'bg-indigo-500/20 text-indigo-400' : 'text-neutral-300 hover:bg-white/10'}`}
                  >
                    <ArrowUpDown size={16} className={reorderMode ? 'text-indigo-400' : 'text-neutral-500'} />
                    並び替えモード
                  </button>
                  <button 
                    onClick={() => { setDeleteMode(true); setReorderMode(false); setIsMenuOpen(false); setSelectedIds(new Set()); setEditMode(false); }}
                    className="flex text-left items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-300 hover:bg-white/10 hover:text-red-400 transition-colors group"
                  >
                    <Trash2 size={16} className="text-neutral-500 group-hover:text-red-400 transition-colors" />
                    削除モード
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      {pickupData && !deleteMode && !reorderMode && (
        <div className="mb-4 px-3 py-2 rounded-lg border border-[#333333] bg-[#151515] flex flex-col gap-1.5 shadow-none">
          <div className="flex items-center gap-1.5 text-[9px] text-neutral-500 font-bold tracking-wide uppercase">
            <span className="truncate max-w-[140px] text-neutral-400">{pickupData.novelTitle}</span>
            <span className="text-neutral-600">/</span>
            <span className="truncate max-w-[140px] text-neutral-500">{pickupData.episodeTitle}</span>
          </div>
          <p className="font-serif italic text-xs leading-snug text-neutral-300">
            {pickupData.quote}{!pickupData.quote.match(/[。！？\.\?!]$/) ? '。' : ''}
          </p>
        </div>
      )}

      {(!deleteMode && !reorderMode && !editMode) && (
        <div className="h-[1px] w-full bg-[#222222] mb-3 shadow-none hidden" />
      )}

      {(reorderMode || deleteMode || editMode) && (
        <div className="mb-6 py-2 px-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
          <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest text-center">
            {editMode ? "名前を変更する作品を選択してください" : deleteMode ? "削除する作品を選択してください" : swapSelectedIdx === null ? "入れ替える作品を1つ選んでください" : "入れ換え先の作品を選んでください"}
          </p>
        </div>
      )}

      <div className="pb-24">
        {novels.length === 0 ? (
          <div className="text-center py-20 text-neutral-700 font-sans italic text-sm border border-dashed border-white/5 rounded-3xl">
            本棚は空です。
          </div>
        ) : (
          <div className="space-y-3">
            {(reorderMode ? novels : [...novels].sort((a, b) => Number(b.isPinned || false) - Number(a.isPinned || false))).map((novel) => {
              const originalIndex = novels.findIndex(n => n.id === novel.id);
              return (
                <ProjectCard 
                  key={novel.id} 
                  novel={novel} 
                  isSelected={deleteMode ? selectedIds.has(novel.id) : (reorderMode && swapSelectedIdx === originalIndex)}
                  reorderMode={reorderMode}
                  deleteMode={deleteMode}
                  editMode={editMode}
                  onClick={() => handleItemClick(novel.id, originalIndex, novel.title)}
                  onTogglePin={() => onTogglePin(novel.id)}
                  onUpdateTitle={(newTitle) => onUpdateNovelTitle(novel.id, newTitle)}
                />
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/90 backdrop-blur-3xl z-50 flex items-center justify-center p-6">
            <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onSubmit={handleSubmit} className="w-full max-w-sm bg-neutral-900 p-8 rounded-[40px] border border-white/10 shadow-2xl">
              <h2 className="text-lg font-black text-white mb-6 tracking-tight text-center">作品を立ち上げる</h2>
              <input autoFocus type="text" placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white outline-none focus:border-indigo-500 transition-all mb-6 font-sans text-center text-base font-bold" />
              <div className="flex gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-[10px] text-neutral-500 font-black uppercase tracking-[0.2em]">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition-transform">Create</button>
              </div>
            </motion.form>
          </motion.div>
        )}

        {renameTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/90 backdrop-blur-3xl z-[100] flex items-center justify-center p-6">
            <motion.form 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }} 
              onSubmit={(e) => {
                e.preventDefault();
                if (renameTarget.title.trim()) {
                  onUpdateNovelTitle(renameTarget.id, renameTarget.title.trim());
                }
                setRenameTarget(null);
                setEditMode(false);
              }} 
              className="w-full max-w-sm bg-neutral-900 p-8 rounded-[40px] border border-white/10 shadow-2xl"
            >
              <h2 className="text-lg font-black text-white mb-6 tracking-tight text-center">プロジェクト名を変更</h2>
              <input 
                autoFocus 
                type="text" 
                value={renameTarget.title} 
                onChange={(e) => setRenameTarget({...renameTarget, title: e.target.value})} 
                className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white outline-none focus:border-indigo-500 transition-all mb-6 font-sans text-center text-base font-bold" 
              />
              <div className="flex gap-4">
                <button type="button" onClick={() => { setRenameTarget(null); setEditMode(false); }} className="flex-1 py-3 text-[10px] text-neutral-500 font-black uppercase tracking-[0.2em]">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition-transform">Save</button>
              </div>
            </motion.form>
          </motion.div>
        )}

        {isDeleteConfirmOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[60] flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-xs bg-neutral-900 p-8 rounded-[40px] border border-red-500/20 shadow-2xl text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={24} className="text-red-500" />
              </div>
              <h2 className="text-lg font-black text-white mb-2 tracking-tight">本当に削除しますか？</h2>
              <p className="text-xs text-neutral-500 mb-8 leading-relaxed italic">選択した {selectedIds.size} 件の作品を完全に削除します。この操作は取り消せません。</p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={executeDelete}
                  className="w-full py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition-transform shadow-lg shadow-red-600/20"
                >
                  削除する
                </button>
                <button 
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="w-full py-4 text-[10px] text-neutral-500 font-black uppercase tracking-[0.2em]"
                >
                  戻る
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface CardProps {
  novel: Novel;
  isSelected: boolean;
  reorderMode: boolean;
  deleteMode: boolean;
  editMode: boolean;
  onClick: () => void;
  onTogglePin: () => void;
  onUpdateTitle: (newTitle: string) => void;
  key?: React.Key;
}

function ProjectCard({ novel, isSelected, reorderMode, deleteMode, editMode, onClick, onTogglePin, onUpdateTitle }: CardProps) {
  return (
    <motion.div
      layout
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick()}
      className={`relative z-10 p-4 rounded-[20px] flex justify-between items-center group transition-all cursor-pointer select-none border \
        ${isSelected ? (deleteMode ? 'border-red-500 bg-red-500/10' : 'border-indigo-500 bg-indigo-500/10') : 'bg-[#1C1C1E] border-[#444444] shadow-lg shadow-black/50 hover:border-[#666666] hover:bg-[#222222]'}`}
    >
      <div className="flex-1 flex items-center gap-3 pointer-events-none">
        {deleteMode && (
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-red-500 border-red-500' : 'border-white/10'}`}>
            {isSelected && <Check size={10} className="text-white" strokeWidth={4} />}
          </div>
        )}
        {editMode && !deleteMode && (
          <div className="w-4 h-4 flex items-center justify-center transition-all text-neutral-400">
            <Edit2 size={14} className="text-indigo-400" />
          </div>
        )}
        <div className="flex-1 pointer-events-auto">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[7px] font-black tracking-[0.2em] px-1.5 py-0.5 rounded transition-colors ${isSelected ? (deleteMode ? 'bg-red-500 text-white' : 'bg-indigo-500 text-white') : 'bg-indigo-500/10 text-indigo-400'}`}>PROJECT</span>
            <span className="text-[7px] text-neutral-500 font-bold tracking-widest">{novel.id.slice(0, 8).toUpperCase()}</span>
            {novel.isPinned && !reorderMode && !deleteMode && (
              <Pin size={10} className="text-indigo-300 fill-indigo-300" />
            )}
          </div>
          
          <div className="flex items-center gap-2 group/title">
            <h3 className="text-base font-bold tracking-tight text-neutral-100 line-clamp-1 leading-snug">
              {novel.title}
            </h3>
          </div>

          <div className="flex items-center gap-3 mt-2 pointer-events-none">
            <div className="flex items-center gap-1.5">
              <div className="w-1 h-1 bg-green-500/80 rounded-full animate-pulse" />
              <span className="text-[8px] text-neutral-300 font-black uppercase tracking-widest">{novel.episodes.length} Episodes</span>
            </div>
            <div className="w-[1px] h-2 bg-[#444444]" />
            <span className="text-[7px] text-neutral-400 font-bold tracking-[0.05em] uppercase">
              Update: {new Date(novel.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
      {!deleteMode && !reorderMode && !editMode && (
        <div className="flex items-center gap-2">
          <button 
            onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${novel.isPinned ? 'hover:bg-indigo-500/20' : 'hover:bg-white/10'}`}
          >
            <Pin size={14} className={novel.isPinned ? 'text-indigo-400 fill-indigo-400' : 'text-neutral-400 hover:text-neutral-200'} />
          </button>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors pointer-events-none ${isSelected ? 'bg-indigo-500/20' : 'bg-[#222222]'}`}>
            <ChevronRight size={14} className={isSelected ? 'text-indigo-300' : 'text-neutral-400'} />
          </div>
        </div>
      )}
      {reorderMode && (
        <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors pointer-events-none bg-[#222222]`}>
          <ArrowUpDown size={14} className={isSelected ? 'text-indigo-300' : 'text-neutral-400'} />
        </div>
      )}
    </motion.div>
  );
}
