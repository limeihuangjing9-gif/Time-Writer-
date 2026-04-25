import { useState } from 'react';
import { useNovelData } from './hooks/useNovelData';
import { ViewState } from './types';
import Shelf from './components/Shelf';
import EpisodeList from './components/EpisodeList';
import Editor from './components/Editor';

export default function App() {
  const [view, setView] = useState<ViewState>({ type: 'shelf' });
  const { 
    novels, 
    isLoaded,
    addNovel, 
    deleteNovel, 
    deleteNovels,
    addEpisode, 
    deleteEpisode, 
    deleteEpisodes,
    updateEpisodeContent,
    reorderNovels,
    swapNovels,
    swapEpisodes,
    toggleNovelPin,
    toggleEpisodePin
  } = useNovelData();

  if (!isLoaded) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>;
  }

  const handleSelectNovel = (novelId: string) => {
    setView({ type: 'episodes', novelId });
  };

  const handleSelectEpisode = (novelId: string, episodeId: string) => {
    setView({ type: 'editor', novelId, episodeId });
  };

  const handleBackToShelf = () => {
    setView({ type: 'shelf' });
  };

  const handleBackToEpisodes = (novelId: string) => {
    setView({ type: 'episodes', novelId });
  };

  return (
    <div className={`${view.type === 'editor' ? 'w-full' : 'max-w-md mx-auto'} min-h-screen relative overflow-x-hidden bg-black`}>
      {view.type === 'shelf' && (
        <Shelf 
          novels={novels}
          onSelectNovel={handleSelectNovel}
          onAddNovel={addNovel}
          onDeleteNovel={deleteNovels}
          onSwapNovels={swapNovels}
          onTogglePin={toggleNovelPin}
        />
      )}

      {view.type === 'episodes' && (
        (() => {
          const novel = novels.find(n => n.id === view.novelId);
          if (!novel) {
            // If novel not found, fall back to shelf safely
            setTimeout(() => handleBackToShelf(), 0);
            return null;
          }
          return (
            <EpisodeList 
              novel={novel}
              onBack={handleBackToShelf}
              onSelectEpisode={(epId) => handleSelectEpisode(view.novelId!, epId)}
              onAddEpisode={(title) => addEpisode(view.novelId!, title)}
              onDeleteEpisode={(epIds) => {
                if (typeof epIds === 'string') {
                  deleteEpisode(view.novelId!, epIds);
                } else {
                  deleteEpisodes(view.novelId!, epIds);
                }
              }}
              onSwapEpisodes={(idxA, idxB) => swapEpisodes(view.novelId!, idxA, idxB)}
              onTogglePin={(epId) => toggleEpisodePin(view.novelId!, epId)}
            />
          );
        })()
      )}

      {view.type === 'editor' && (
        (() => {
          const novel = novels.find(n => n.id === view.novelId);
          const episode = novel?.episodes.find(e => e.id === view.episodeId);
          
          if (!novel || !episode) {
            handleBackToShelf();
            return null;
          }

          // Stable callback to pass to Editor
          const handleEditorSave = (c: string, l: any[]) => {
            updateEpisodeContent(view.novelId!, view.episodeId!, c, l);
          };

          const EditorComponent = Editor as any;

          return (
            <EditorComponent 
              key={episode.id}
              title={episode.title}
              initialContent={episode.content}
              initialPlaybackLog={episode.playbackLog}
              onBack={() => handleBackToEpisodes(view.novelId!)}
              onSave={handleEditorSave}
            />
          );
        })()
      )}
    </div>
  );
}
