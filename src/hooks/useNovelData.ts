import { useState, useEffect, useRef, useCallback } from 'react';
import { Novel } from '../types';

const STORAGE_KEY = 'kotobako_novels_v1';
const CORE_BACKUP_KEY = 'kotobako_core_backup_v1'; // Only text/structure, no logs (safety)
const DB_NAME = 'KotobakoDB';
const STORE_NAME = 'novelsStore';

const INITIAL_SAMPLE_DATA: Novel[] = [
  {
    id: 'tutorial-novel-1',
    title: 'Time×Writerへようこそ。',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isPinned: true,
    episodes: [
      {
        id: 'tutorial-episode-1',
        title: 'Time×Writerへようこそ。',
        content: 'Time×Writerへようこそ。',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        playbackLog: [],
        isPinned: true
      }
    ]
  }
];

// Apply 26 char formatting to initial data
const formatString26 = (str: string) => {
  const rawStr = str.replace(/\n/g, '');
  const chars = Array.from(rawStr);
  const chunks = [];
  for (let i = 0; i < chars.length; i += 26) {
    chunks.push(chars.slice(i, i + 26).join(''));
  }
  return chunks.join('\n');
};

INITIAL_SAMPLE_DATA.forEach(novel => {
  novel.episodes.forEach(ep => {
    ep.content = formatString26(ep.content);
  });
});

// Tiny IndexedDB wrapper
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getFromDB = async (): Promise<Novel[] | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(STORAGE_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("IndexedDB read error:", e);
    // Fallback to localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  }
};

const saveToDB = async (data: Novel[]) => {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(data, STORAGE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("IndexedDB write error:", e);
  }
};

// Fallback for crypto.randomUUID if not in a secure context
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

export function useNovelData() {
  const [novels, setNovels] = useState<Novel[]>([]);
  
  const [isLoaded, setIsLoaded] = useState(false);
  const saveInProgress = useRef(false);
  const pendingSave = useRef<Novel[] | null>(null);

  useEffect(() => {
    const loadData = async () => {
      let data = await getFromDB();
      const localDataRaw = localStorage.getItem(STORAGE_KEY);
      const localData = localDataRaw ? JSON.parse(localDataRaw) : null;
      
      // Perform Migration: If localStorage exists and is newer or DB is empty, use it and clear localStorage
      if (localData && Array.isArray(localData) && localData.length > 0) {
        if (!data || data.length === 0) {
            data = localData;
            // Write migrated data to IDB
            await saveToDB(localData);
        } else {
            const maxLocalUpdate = Math.max(...localData.map(n => n.updatedAt || 0));
            const maxDbUpdate = Math.max(...data.map(n => n.updatedAt || 0));
            if (maxLocalUpdate > maxDbUpdate) {
                data = localData;
                await saveToDB(localData);
            }
        }
        // Remove from localStorage to signify complete migration and free space
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch(e) {}
      }

      const visited = localStorage.getItem('kotobako_tutorial_v11');
      
      if (!visited && (!data || data.length === 0)) {
        setNovels(INITIAL_SAMPLE_DATA);
        localStorage.setItem('kotobako_tutorial_v11', 'true');
      } else if (data && Array.isArray(data) && data.length > 0) {
        // Enforce 26-char rule strictly for the tutorial data
        const formattedData = data.map(n => {
          if (!n) return n;
          const episodes = Array.isArray(n.episodes) ? n.episodes : [];
          
          if (n.id === 'tutorial-novel-1') {
            return {
              ...n,
              episodes: episodes.map(e => ({
                ...e,
                content: formatString26(e.content || ''),
                playbackLog: Array.isArray(e.playbackLog) ? e.playbackLog : []
              }))
            };
          }
          return {
            ...n,
            episodes: episodes.map(e => ({
              ...e,
              content: e.content || '',
              playbackLog: Array.isArray(e.playbackLog) ? e.playbackLog : []
            }))
          };
        });
        
        setNovels(formattedData);
      }
      setIsLoaded(true);
    };
    loadData();
  }, []);

  // Ironclad immediate save effect
  useEffect(() => {
    if (!isLoaded) return;

    const performSave = async () => {
      if (saveInProgress.current) {
        pendingSave.current = novels;
        return;
      }
      saveInProgress.current = true;
      await saveToDB(novels);
      saveInProgress.current = false;
      
      if (pendingSave.current) {
        const next = pendingSave.current;
        pendingSave.current = null;
        performSave();
      }
    };

    performSave();
  }, [novels, isLoaded]);

  const addNovel = (title: string) => {
    const newNovel: Novel = {
      id: generateUUID(),
      title,
      episodes: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setNovels(prev => [newNovel, ...prev]);
  };

  const deleteNovel = (id: string) => {
    setNovels(prev => prev.filter(n => n.id !== id));
  };

  const deleteNovels = (ids: Set<string>) => {
    setNovels(prev => prev.filter(n => !ids.has(n.id)));
  };

  const addEpisode = (novelId: string, title: string) => {
    setNovels(prev => prev.map(n => {
      if (n.id === novelId) {
        return {
          ...n,
          updatedAt: Date.now(),
          episodes: [
            ...n.episodes,
            {
              id: generateUUID(),
              title,
              content: '',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              playbackLog: []
            }
          ]
        };
      }
      return n;
    }));
  };

  const deleteEpisode = (novelId: string, episodeId: string) => {
    setNovels(prev => prev.map(n => {
      if (n.id === novelId) {
        return {
          ...n,
          episodes: n.episodes.filter(e => e.id !== episodeId)
        };
      }
      return n;
    }));
  };

  const deleteEpisodes = (novelId: string, episodeIds: Set<string>) => {
    setNovels(prev => prev.map(n => {
      if (n.id === novelId) {
        const episodes = Array.isArray(n.episodes) ? n.episodes : [];
        return {
          ...n,
          updatedAt: Date.now(),
          episodes: episodes.filter(e => !episodeIds.has(e.id))
        };
      }
      return n;
    }));
  };

  const updateEpisodeContent = useCallback((novelId: string, episodeId: string, content: string, playbackLog?: { c: string; s: number; t: number; p: number }[]) => {
    setNovels(prev => prev.map(n => {
      if (n.id === novelId) {
        const episodes = Array.isArray(n.episodes) ? n.episodes : [];
        return {
          ...n,
          episodes: episodes.map(e => {
            if (e.id === episodeId) {
              return { ...e, content, playbackLog, updatedAt: Date.now() };
            }
            return e;
          })
        };
      }
      return n;
    }));
  }, []);

  const reorderNovels = (newNovels: Novel[]) => {
    setNovels(newNovels);
  };

  const swapNovels = (idxA: number, idxB: number) => {
    const newNovels = [...novels];
    [newNovels[idxA], newNovels[idxB]] = [newNovels[idxB], newNovels[idxA]];
    setNovels(newNovels);
  };

  const swapEpisodes = (novelId: string, idxA: number, idxB: number) => {
    setNovels(prev => prev.map(n => {
      if (n.id === novelId) {
        const episodes = Array.isArray(n.episodes) ? n.episodes : [];
        const newEpisodes = [...episodes];
        if (idxA >= 0 && idxA < newEpisodes.length && idxB >= 0 && idxB < newEpisodes.length) {
          [newEpisodes[idxA], newEpisodes[idxB]] = [newEpisodes[idxB], newEpisodes[idxA]];
        }
        return { ...n, episodes: newEpisodes };
      }
      return n;
    }));
  };

  const toggleNovelPin = (id: string) => {
    setNovels(prev => prev.map(n => n.id === id ? { ...n, isPinned: !n.isPinned } : n));
  };

  const toggleEpisodePin = (novelId: string, episodeId: string) => {
    setNovels(prev => prev.map(n => {
      if (n.id === novelId) {
        return {
          ...n,
          episodes: n.episodes.map(e => e.id === episodeId ? { ...e, isPinned: !e.isPinned } : e)
        };
      }
      return n;
    }));
  };

  const updateNovelTitle = (id: string, newTitle: string) => {
    setNovels(prev => prev.map(n => n.id === id ? { ...n, title: newTitle, updatedAt: Date.now() } : n));
  };

  const updateEpisodeTitle = (novelId: string, episodeId: string, newTitle: string) => {
    setNovels(prev => prev.map(n => {
      if (n.id === novelId) {
        return {
          ...n,
          updatedAt: Date.now(),
          episodes: n.episodes.map(e => e.id === episodeId ? { ...e, title: newTitle, updatedAt: Date.now() } : e)
        };
      }
      return n;
    }));
  };

  return {
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
    toggleEpisodePin,
    updateNovelTitle,
    updateEpisodeTitle
  };
}
