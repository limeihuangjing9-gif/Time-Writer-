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
    // 1. Core Backup (Text only, very safe)
    try {
      const coreData = data.map(n => ({
        ...n,
        episodes: n.episodes.map(e => ({ ...e, playbackLog: [] })) // Strip logs for backup
      }));
      localStorage.setItem(CORE_BACKUP_KEY, JSON.stringify(coreData));
    } catch (e) {
      console.warn("Core backup failed", e);
    }

    // 2. Full Storage (LocalStorage Sync)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (quotaEx) {
      console.warn("LocalStorage full, trying to save without oldest logs...");
      // Optional: prune old logs strategy if needed
    }

    // 3. Persistent Storage (IndexedDB Async)
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
  // Sync initialization for ironclad reliability and zero-flicker load
  const [novels, setNovels] = useState<Novel[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
      const backup = localStorage.getItem(CORE_BACKUP_KEY);
      if (backup) {
        const parsed = JSON.parse(backup);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error("Critical: Initial sync load failed", e);
    }
    return [];
  });
  
  const [isLoaded, setIsLoaded] = useState(false);
  const saveInProgress = useRef(false);
  const pendingSave = useRef<Novel[] | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const data = await getFromDB();
      const visited = localStorage.getItem('kotobako_tutorial_v11');
      
      if (!visited && (!data || data.length === 0) && novels.length === 0) {
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
        
        let shouldOverwrite = true;
        if (novels.length > 0) {
          const maxLocalUpdate = Math.max(...novels.map(n => n.updatedAt || 0));
          const maxDbUpdate = Math.max(...formattedData.map(n => n.updatedAt || 0));
          if (maxLocalUpdate >= maxDbUpdate) {
            shouldOverwrite = false;
          }
        }
        
        if (shouldOverwrite) {
          setNovels(formattedData);
        }
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
