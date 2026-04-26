import React, { useState, useEffect } from 'react';
import { Novel } from '../types';
import { ArrowLeft, Plus, Trash2, ChevronRight, ArrowUpDown, Check, Pin, Edit2, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface EpisodeListProps {
  novel: Novel;
  onBack: () => void;
  onSelectEpisode: (episodeId: string) => void;
  onAddEpisode: (title: string) => void;
  onDeleteEpisode: (episodeIds: Set<string> | string) => void;
  onSwapEpisodes: (idxA: number, idxB: number) => void;
  onTogglePin: (episodeId: string) => void;
  onUpdateNovelTitle: (newTitle: string) => void;
  onUpdateEpisodeTitle: (episodeId: string, newTitle: string) => void;
}

export default function EpisodeList({ novel, onBack, onSelectEpisode, onAddEpisode, onDeleteEpisode, onSwapEpisodes, onTogglePin, onUpdateNovelTitle, onUpdateEpisodeTitle }: EpisodeListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [renameTarget, setRenameTarget] = useState<{id: string, title: string} | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [editEpMode, setEditEpMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [swapSelectedIdx, setSwapSelectedIdx] = useState<number | null>(null);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTitle.trim()) {
      onAddEpisode(newTitle.trim());
      setNewTitle('');
      setIsAdding(false);
    }
  };

  const handleItemClick = (episodeId: string, index: number, title: string) => {
    if (editEpMode) {
      setRenameTarget({ id: episodeId, title });
      return;
    }
    if (deleteMode) {
      const next = new Set(selectedIds);
      if (next.has(episodeId)) next.delete(episodeId);
      else next.add(episodeId);
      setSelectedIds(next);
      return;
    }

    if (reorderMode) {
      if (swapSelectedIdx === null) {
        setSwapSelectedIdx(index);
      } else {
        if (swapSelectedIdx !== index) {
          onSwapEpisodes(swapSelectedIdx, index);
        }
        setSwapSelectedIdx(null);
      }
    } else {
      onSelectEpisode(episodeId);
    }
  };

  const executeDelete = () => {
    onDeleteEpisode(selectedIds);
    setSelectedIds(new Set());
    setDeleteMode(false);
    setIsDeleteConfirmOpen(false);
  };

  return (
    <div className="min-h-screen p-6 pt-12 animate-fade-in relative z-10">
      <header className="mb-8 relative z-30">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-neutral-500 text-[10px] font-black uppercase tracking-widest mb-4 active:scale-95 transition-transform"
        >
          <ArrowLeft size={14} /> Library
        </button>
        <div className="flex justify-between items-end">
          <div className="max-w-[180px]">
            <h1 className="text-xl font-bold tracking-tight text-white line-clamp-1">
              {novel.title}
            </h1>
            <p className="text-[9px] text-indigo-400 uppercase tracking-[0.2em] mt-1 font-black">Archive / Episodes</p>
          </div>
          <div className="relative z-50">
            {!deleteMode && (
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)} 
                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Settings size={20} />
              </button>
            )}
            
            {deleteMode && (
              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={() => setDeleteMode(false)} 
                  className="px-3 h-10 bg-white/5 text-neutral-500 rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-white/10"
                >
                  キャンセル
                </button>
                <button 
                  type="button"
                  onClick={() => selectedIds.size > 0 && setIsDeleteConfirmOpen(true)} 
                  disabled={selectedIds.size === 0} 
                  className={`px-3 h-10 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${selectedIds.size > 0 ? 'bg-red-600 text-white shadow-lg cursor-pointer' : 'bg-red-600/20 text-red-600/50 cursor-not-allowed'}`}
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
                      onClick={() => {
                        setIsMenuOpen(false);
                        setRenameTarget({ id: 'novel', title: novel.title });
                      }}
                      className="flex text-left items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-200 hover:bg-white/10 transition-colors"
                    >
                      <Edit2 size={16} className="text-white" strokeWidth={3} />
                      現在のプロジェクト名を変更
                    </button>
                    <button 
                      onClick={() => { setEditEpMode(!editEpMode); setIsMenuOpen(false); setReorderMode(false); setDeleteMode(false); }}
                      className={`flex text-left items-center gap-3 px-4 py-3 text-sm font-bold transition-colors ${editEpMode ? 'bg-indigo-500/20 text-indigo-400' : 'text-neutral-300 hover:bg-white/10'}`}
                    >
                      <Edit2 size={16} className={editEpMode ? 'text-indigo-400' : 'text-neutral-500'} />
                      このエピソード名を変更
                    </button>
                    <div className="h-[1px] w-full bg-[#222222] my-1" />
                    <button 
                      onClick={() => { setReorderMode(!reorderMode); setIsMenuOpen(false); setSwapSelectedIdx(null); setDeleteMode(false); setEditEpMode(false); }}
                      className={`flex text-left items-center gap-3 px-4 py-3 text-sm font-bold transition-colors ${reorderMode ? 'bg-indigo-500/20 text-indigo-400' : 'text-neutral-300 hover:bg-white/10'}`}
                    >
                      <ArrowUpDown size={16} className={reorderMode ? 'text-indigo-400' : 'text-neutral-500'} />
                      並び替えモード
                    </button>
                    <button 
                      onClick={() => { setDeleteMode(true); setReorderMode(false); setIsMenuOpen(false); setSelectedIds(new Set()); setEditEpMode(false); }}
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
        </div>
      </header>

      {(reorderMode || deleteMode || editEpMode) && (
        <div className="mb-6 py-2 px-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl font-black italic">
          <p className="text-[9px] text-indigo-400 uppercase tracking-widest text-center">
            {editEpMode ? "名前を変更するエピソードを選択" : deleteMode ? "削除するエピソードを選択" : swapSelectedIdx === null ? "交換元を選択" : "交換先を選択"}
          </p>
        </div>
      )}

      <div className="space-y-2.5 pb-24">
        {(() => {
          const episodes = Array.isArray(novel.episodes) ? novel.episodes : [];
          const currentList = reorderMode 
            ? episodes 
            : [...episodes].sort((a, b) => Number(b.isPinned || false) - Number(a.isPinned || false));
            
          return currentList.map((episode) => {
            const originalIndex = episodes.findIndex(e => e.id === episode.id);
            return (
              <EpisodeCard 
                key={episode.id}
                episode={episode}
                index={originalIndex}
                isSelected={deleteMode ? selectedIds.has(episode.id) : (reorderMode && swapSelectedIdx === originalIndex)}
                reorderMode={reorderMode}
                deleteMode={deleteMode}
                editEpMode={editEpMode}
                onClick={() => handleItemClick(episode.id, originalIndex, episode.title)}
                onTogglePin={() => onTogglePin(episode.id)}
                onUpdateTitle={(newTitle) => onUpdateEpisodeTitle(episode.id, newTitle)}
              />
            );
          });
        })()}

        {!isAdding && !reorderMode && !deleteMode && (
          <button 
            type="button"
            onClick={() => setIsAdding(true)}
            className="w-full py-4 mt-4 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl flex items-center justify-center gap-2 text-neutral-600 active:scale-[0.98] transition-all"
          >
            <Plus size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">New Episode</span>
          </button>
        )}

        {isAdding && (
          <form onSubmit={handleSubmit} className="mt-4 p-6 bg-neutral-900 border border-white/5 rounded-[28px] shadow-2xl">
            <input 
              autoFocus
              type="text" 
              placeholder="Title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-xl p-4 text-white outline-none focus:border-indigo-500 transition-colors mb-4 font-sans text-sm"
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => setIsAdding(false)} className="flex-1 text-[10px] text-neutral-500 font-black uppercase tracking-widest">Cancel</button>
              <button type="submit" className="flex-1 py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform">Create</button>
            </div>
          </form>
        )}
      </div>

      <AnimatePresence>
        {renameTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/90 backdrop-blur-3xl z-[100] flex items-center justify-center p-6">
            <motion.form 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }} 
              onSubmit={(e) => {
                e.preventDefault();
                if (renameTarget.title.trim()) {
                  if (renameTarget.id === 'novel') {
                    onUpdateNovelTitle(renameTarget.title.trim());
                  } else {
                    onUpdateEpisodeTitle(renameTarget.id, renameTarget.title.trim());
                  }
                }
                setRenameTarget(null);
                setEditEpMode(false);
              }} 
              className="w-full max-w-sm bg-neutral-900 p-8 rounded-[40px] border border-white/10 shadow-2xl"
            >
              <h2 className="text-lg font-black text-white mb-6 tracking-tight text-center">
                {renameTarget.id === 'novel' ? "プロジェクト名を変更" : "エピソード名を変更"}
              </h2>
              <input 
                autoFocus 
                type="text" 
                value={renameTarget.title} 
                onChange={(e) => setRenameTarget({...renameTarget, title: e.target.value})} 
                className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white outline-none focus:border-indigo-500 transition-all mb-6 font-sans text-center text-base font-bold" 
              />
              <div className="flex gap-4">
                <button type="button" onClick={() => { setRenameTarget(null); setEditEpMode(false); }} className="flex-1 py-3 text-[10px] text-neutral-500 font-black uppercase tracking-[0.2em]">Cancel</button>
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
              <p className="text-xs text-neutral-500 mb-8 leading-relaxed italic">選択した {selectedIds.size} 件のエピソードを完全に削除します。この操作は取り消せません。</p>
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

interface EpCardProps {
  episode: any;
  index: number;
  isSelected: boolean;
  reorderMode: boolean;
  deleteMode: boolean;
  editEpMode: boolean;
  onClick: () => void;
  onTogglePin: () => void;
  onUpdateTitle: (newTitle: string) => void;
  key?: React.Key;
}

function EpisodeCard({ episode, index, isSelected, reorderMode, deleteMode, editEpMode, onClick, onTogglePin, onUpdateTitle }: EpCardProps) {
  return (
    <motion.div
      layout
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick()}
      className={`relative z-10 p-3.5 border rounded-[18px] flex justify-between items-center group transition-all cursor-pointer select-none \
        ${isSelected ? (deleteMode ? 'border-red-500 bg-red-500/10' : 'border-indigo-500 bg-indigo-500/10') : 'bg-[#1C1C1E] border-[#444444] shadow-md shadow-black/50 hover:border-[#666666] hover:bg-[#222222]'}`}
    >
      <div className="flex items-center gap-3 pointer-events-none flex-1">
        {deleteMode && (
          <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-red-500 border-red-500' : 'border-white/10'}`}>
            {isSelected && <Check size={8} className="text-white" strokeWidth={4} />}
          </div>
        )}
        {editEpMode && !deleteMode && (
          <div className="w-3.5 h-3.5 flex items-center justify-center transition-all text-neutral-400">
            <Edit2 size={12} className="text-indigo-400" />
          </div>
        )}
        <div className="flex items-start gap-3 flex-1 pointer-events-auto">
          <div className="flex flex-col items-center pointer-events-none">
            <span className={`text-[8px] font-black mt-1 uppercase tracking-tighter transition-colors ${isSelected ? (deleteMode ? 'text-red-400' : 'text-indigo-400') : 'text-neutral-500'}`}>
              EP {String(index + 1).padStart(2, '0')}
            </span>
            {episode.isPinned && !reorderMode && !deleteMode && (
               <Pin size={8} className="text-indigo-300 fill-indigo-300 mt-1" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 group/etitle">
              <h3 className="font-sans font-medium text-sm tracking-tight text-white line-clamp-1 leading-tight">
                {episode.title}
              </h3>
            </div>
            <p className="text-[7px] text-neutral-400 uppercase mt-0.5 font-bold tracking-[0.1em] pointer-events-none">Chars: {(episode.content || '').length.toLocaleString()}</p>
          </div>
        </div>
      </div>
      {!deleteMode && !reorderMode && !editEpMode && (
        <div className="flex items-center gap-2">
          <button 
            onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${episode.isPinned ? 'hover:bg-indigo-500/20' : 'hover:bg-white/10'}`}
          >
            <Pin size={12} className={episode.isPinned ? 'text-indigo-400 fill-indigo-400' : 'text-neutral-400 hover:text-neutral-200'} />
          </button>
          <ChevronRight size={12} className={`pointer-events-none transition-colors ${isSelected ? 'text-indigo-300' : 'text-neutral-400'}`} />
        </div>
      )}
      {reorderMode && (
        <ArrowUpDown size={12} className={`pointer-events-none transition-colors ${isSelected ? 'text-indigo-300' : 'text-neutral-400'}`} />
      )}
    </motion.div>
  );
}
