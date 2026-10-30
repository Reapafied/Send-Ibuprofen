import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps } from "firebase/app";
import { getDatabase, ref, set, update, onValue } from "firebase/database";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDcru0r1xQJEXiCI-itA1oYMSZL3eSP4KU",
  authDomain: "send-ibuprofen-bingo.firebaseapp.com",
  databaseURL: "https://send-ibuprofen-bingo-default-rtdb.firebaseio.com/",
  projectId: "send-ibuprofen-bingo",
  storageBucket: "send-ibuprofen-bingo.firebasestorage.app",
  messagingSenderId: "995194665466",
  appId: "1:995194665466:web:d6d0d62f078f0e011d4c43"
};

const DEFAULT_CHALLENGES = [
    "Savior of Silverpine, Find and Kill an Elite Son of Arugal by level 25",
    "Ride the Deeprun Tram and survive",
    "Rare Hunter: Kill 10 different rare spawn mobs in the open world. Keep Track!",
    "Get to the Badlands FP the hard way, Running from Stranglethorn through Blackrock While flagged",
    "Complete at least two of the Alliance dungeons",
    "Saviour of Darkshire. Kill Stitches before level 41.",
    "Gain Honored with one of the Centaur clans",
    "Do all three of the mechanical chicken escorts",
    "Gain Revered with any of the new Factions. Other than Windshapers.",
    "Finish every 'Test of' Quest from 1k needles. If you gain the Mark of Shame, you must head to any major city and announce 'I'M A DUNCE AMA'.",
    "It's dangerous to go alone, Complete Linken's Chain in Ungoro",
    "Capture a Flag in WSG",
    "Capture or defend each point in AB In a single round",
    "Kill a Quest or World elite by kiting it to town guards. Solo.",
    "Message In a Bottle. (Level 42)",
    "Complete 'A Fine Mess' Inside Gnomeregan",
    "As Horde, Find and Complete the Captian Sanders' Treasure Map. Don't use an addon. Read the quest! (Level 10)",
    "Get the Mallet of Zul'Farrak (Level 45)",
    "Save a random player from dying in the open world (Level 20+)",
    "Complete 3 new dungeons flawless (No deaths No wipes)",
    "Stay flagged anytime you are in Hillsbrad until you complete the Helcular's Rod quest. You MUST fight any flagged alliance.",
    "Kill one of the Patrolling Eite Dragons around the world. Example: Narillasanz, Brimgore ect. Before the mob is grey",
    "Complete Cortello's Riddle using only the ingame quest text (Level 35)",
    "Complete Hilary's Necklace While Flagged. (Level 15)",
    "Complete the Land Ho! quest chain. (Level 45)",
    "As a group. Complete a wing of SM while everyone is wearing only vendor whites"
];

// Wild card challenges shown to the left of the board. Drag one onto a board
// square (or tap a wild card, then tap a square) to swap it in.
// TODO: replace these placeholders with your own wild card challenges.
const WILDCARDS = [
    "WILD: Hit a 100 need roll",
    "WILD: Successfully catch a fish from inside both Stormwind and IronForge",
    "WILD: Take a sexy screenshot of yourself in the Goldshire Inn's bed.UwU",
    "WILD: Loot the Gurubashi arena chest",
    "WILD: Replace me with a wildcard challenge #5"
];

const WIN_PATTERNS = [
    [0,1,2,3,4], [5,6,7,8,9], [10,11,12,13,14], [15,16,17,18,19], [20,21,22,23,24],
    [0,5,10,15,20], [1,6,11,16,21], [2,7,12,17,22], [3,8,13,18,23], [4,9,14,19,24],
    [0,6,12,18,24], [4,8,12,16,20]
];

export default function App() {
    const [currentRoomId, setCurrentRoomId] = useState(() =>
            new URLSearchParams(window.location.search).get('room')?.toUpperCase() || 'GLOBAL'
    );
    const [roomCodeDraft, setRoomCodeDraft] = useState(() =>
            new URLSearchParams(window.location.search).get('room')?.toUpperCase() || 'GLOBAL'
    );
  const [masterPool, setMasterPool] = useState(DEFAULT_CHALLENGES);
  
  const [myPlayerId] = useState(() => {
      const linkedPlayerId = new URLSearchParams(window.location.search).get('player');
      if (linkedPlayerId && /^p_[a-z0-9]{7}$/.test(linkedPlayerId)) {
          localStorage.setItem('wow_bingo_user_id', linkedPlayerId);
          return linkedPlayerId;
      }
      const savedId = localStorage.getItem('wow_bingo_user_id');
      if (savedId) return savedId;
      const newId = 'p_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('wow_bingo_user_id', newId);
      return newId;
  });
  const [myPlayerName, setMyPlayerName] = useState(() => {
      const savedName = localStorage.getItem('wow_bingo_user_name') || 'Mankrik';
      localStorage.setItem('wow_bingo_user_name', savedName);
      return savedName;
  });

  const [roomData, setRoomData] = useState({
      seed: 'BARRENS2026',
      players: {}
  });

  const [activeViewPlayerId, setActiveViewPlayerId] = useState('');
  const [syncStatus, setSyncStatus] = useState({ text: 'Connecting...', color: 'text-amber-400' });
  
  const [activeModal, setActiveModal] = useState(null);
  const [customPoolText, setCustomPoolText] = useState(DEFAULT_CHALLENGES.join('\n'));

  // Wild card interaction state
  const [draggedWild, setDraggedWild] = useState(null);
  const [selectedWild, setSelectedWild] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [isFlashbangActive, setIsFlashbangActive] = useState(false);

  const dbRef = useRef(null);
  const previousBingoCountsRef = useRef(null);
  const previousPlayerNamesRef = useRef(null);
  const lastStampSoundRef = useRef(null);
  const stampSoundFilesRef = useRef([]);

  // Construct Firebase Config Object from env
  const getFirebaseConfig = () => {
      if (import.meta.env.VITE_FIREBASE_API_KEY) {
          return {
              apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
              authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
              databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
              projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
              storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
              messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
              appId: import.meta.env.VITE_FIREBASE_APP_ID,
          };
      }
      if (import.meta.env.VITE_FIREBASE_CONFIG) {
          try {
              return typeof import.meta.env.VITE_FIREBASE_CONFIG === 'string'
                  ? JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG)
                  : import.meta.env.VITE_FIREBASE_CONFIG;
          } catch (e) { return null; }
      }
      return FIREBASE_CONFIG;
  };

  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const urlRoom = params.get('room')?.toUpperCase() || 'GLOBAL';
      setCurrentRoomId(urlRoom);

      const config = getFirebaseConfig();

      try {
          const app = !getApps().length ? initializeApp(config) : getApps()[0];
          const database = getDatabase(app);
          dbRef.current = database;
          setSyncStatus({ text: 'Connecting...', color: 'text-amber-400' });
          const unsubscribe = subscribeToRoom(urlRoom, database);
          return unsubscribe;
      } catch (err) {
          console.error("Firebase initialization failed:", err);
          setSyncStatus({ text: 'Config Error', color: 'text-red-500' });
      }
  }, []);

  const subscribeToRoom = (roomId, database = dbRef.current) => {
      if (!database) return;
      setCurrentRoomId(roomId);
      setRoomCodeDraft(roomId);

      const roomNodeRef = ref(database, `wow_bingo_rooms/${roomId}`);
      let receivedInitialSnapshot = false;
      return onValue(roomNodeRef, (snapshot) => {
          const isInitialSnapshot = !receivedInitialSnapshot;
          receivedInitialSnapshot = true;
          const val = snapshot.val();
          if (val) {
              const players = val.players || {};
              const bingoCounts = Object.fromEntries(
                  Object.entries(players).map(([playerId, player]) => [
                      playerId,
                      checkBingoLines(player.stamps || {}).winCount
                  ])
              );
              const playerNames = Object.fromEntries(
                  Object.entries(players).map(([playerId, player]) => [playerId, player.name || ''])
              );
              const previousBingoCounts = previousBingoCountsRef.current;
              const previousPlayerNames = previousPlayerNamesRef.current;
              if (previousBingoCounts) {
                  Object.entries(bingoCounts).forEach(([playerId, winCount]) => {
                      if (playerId !== myPlayerId &&
                          previousBingoCounts[playerId] !== undefined &&
                          winCount > previousBingoCounts[playerId]) {
                          playSound('opponentBingo');
                      }
                  });
              }
              if (previousPlayerNames) {
                  Object.entries(playerNames).forEach(([playerId, playerName]) => {
                      const normalizedName = playerName.toLowerCase().replace(/[^a-z0-9]/g, '');
                      const previousName = previousPlayerNames[playerId] || '';
                      const previousNormalizedName = previousName.toLowerCase().replace(/[^a-z0-9]/g, '');
                      if (normalizedName === 'joehendry' && previousNormalizedName !== 'joehendry') {
                          playSound('easterEgg');
                      }
                  });
              }
              previousBingoCountsRef.current = bingoCounts;
              previousPlayerNamesRef.current = playerNames;
              setRoomData({ ...val, players });
              setSyncStatus({ text: 'Connected', color: 'text-amber-400' });
              const savedPlayer = val.players?.[myPlayerId];
              if (savedPlayer?.name && savedPlayer.name !== myPlayerName) {
                  setMyPlayerName(savedPlayer.name);
                  localStorage.setItem('wow_bingo_user_name', savedPlayer.name);
              }
              if (isInitialSnapshot && !val.players?.[myPlayerId]) {
                  registerUserInRoom(roomId, database);
              }
          } else {
              update(roomNodeRef, { seed: 'BARRENS2026' }).catch(handleDatabaseError);
              registerUserInRoom(roomId, database);
          }
      }, handleDatabaseError);
  };

  const registerUserInRoom = (roomId, database) => {
      const playerRef = ref(database, `wow_bingo_rooms/${roomId}/players/${myPlayerId}`);
      set(playerRef, { id: myPlayerId, name: myPlayerName, seed: 'BARRENS2026', stamps: { 12: true } })
          .catch(handleDatabaseError);
  };

  const handleDatabaseError = (error) => {
      console.error('Firebase database operation failed:', error);
      const reason = error?.code || error?.message || 'Unknown error';
      setSyncStatus({ text: `Database error (${reason})`, color: 'text-red-400' });
  };

  const loadStampSoundFiles = async () => {
      if (stampSoundFilesRef.current.length) return stampSoundFilesRef.current;
      try {
          const response = await fetch(`${import.meta.env.BASE_URL}audio/stampSounds/manifest.json`, { cache: 'no-store' });
          if (!response.ok) throw new Error(`Stamp manifest returned ${response.status}`);
          const manifest = await response.json();
          stampSoundFilesRef.current = Array.isArray(manifest.files)
              ? manifest.files.filter((fileName) => fileName.toLowerCase().endsWith('.wav'))
              : [];
      } catch (error) {
          console.warn('Unable to load stamp sound manifest:', error);
      }
      return stampSoundFilesRef.current;
  };

  const playRandomStampSound = async () => {
      const stampSounds = await loadStampSoundFiles();
      if (!stampSounds.length) return;

      const choices = stampSounds.filter((fileName) => fileName !== lastStampSoundRef.current);
      const pool = choices.length ? choices : stampSounds;
      const fileName = pool[Math.floor(Math.random() * pool.length)];
      lastStampSoundRef.current = fileName;
      playSoundFile(`audio/stampSounds/${fileName}`);
      if (fileName.toLowerCase() === 'cs-flashbang.wav') {
          setIsFlashbangActive(false);
          window.requestAnimationFrame(() => {
              setIsFlashbangActive(true);
              window.setTimeout(() => setIsFlashbangActive(false), 10000);
          });
      }
  };

  const playSoundFile = (assetPath) => {
      try {
          const audio = new Audio(`${import.meta.env.BASE_URL}${assetPath}`);
          audio.volume = 0.75;
          audio.play().catch((error) => {
              console.warn('Audio playback was blocked or unavailable:', error);
          });
      } catch (error) {
          console.warn('Audio playback error:', error);
      }
  };

  const playSound = (type) => {
      if (type === 'stamp') {
          playRandomStampSound();
          return;
      }

      const soundFiles = {
          bingo: 'audio/bingo.wav',
          opponentBingo: 'audio/opponent-bingo.wav',
          easterEgg: 'audio/easteregg.wav',
          wildcardSwap: 'audio/wildcard-swap.wav'
      };
      const assetPath = soundFiles[type];
      if (assetPath) playSoundFile(assetPath);
  };

  const seededRandom = (seedStr) => {
      let hash = 0;
      for (let i = 0; i < seedStr.length; i++) {
          hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
      }
      return function() {
          const x = Math.sin(hash++) * 10000;
          return x - Math.floor(x);
      };
  };

  const generateCardItems = (seed) => {
      const rng = seededRandom(seed);
      let poolCopy = [...masterPool];
      let shuffled = [];
      while (poolCopy.length > 0) {
          const index = Math.floor(rng() * poolCopy.length);
          shuffled.push(poolCopy.splice(index, 1)[0]);
      }
      let grid25 = [];
      let itemIdx = 0;
      for (let i = 0; i < 25; i++) {
          if (i === 12) {
              grid25.push("FREE SPACE: Reach Level 20");
          } else {
              grid25.push(shuffled[itemIdx % shuffled.length] || "Complete Quest");
              itemIdx++;
          }
      }
      return grid25;
  };

  // Maps slot keys to challenge text: s0..s24 = board squares, w0..w4 = wild cards
  const getSlotTexts = (seed) => {
      const texts = {};
      generateCardItems(seed).forEach((t, i) => { texts[`s${i}`] = t; });
      WILDCARDS.forEach((t, i) => { texts[`w${i}`] = t; });
      return texts;
  };

  const checkBingoLines = (stamps) => {
      let winCount = 0;
      let winningIndices = new Set();
      WIN_PATTERNS.forEach(pattern => {
          const hasBingo = pattern.every(idx => stamps[idx]);
          if (hasBingo) {
              winCount++;
              pattern.forEach(i => winningIndices.add(i));
          }
      });
      return { winCount, winningIndices };
  };

  const toggleSquareStamp = (targetPlayerId, squareIndex) => {
      if (targetPlayerId !== myPlayerId || squareIndex === 12) return;

      const existingPlayer = roomData.players?.[myPlayerId];
      const player = existingPlayer || {
          id: myPlayerId,
          name: myPlayerName,
          seed: 'BARRENS2026',
          stamps: { 12: true }
      };
      const stamps = { ...(player.stamps || {}) };
      const wasStamped = !!stamps[squareIndex];
      if (wasStamped) {
          delete stamps[squareIndex];
      } else {
          stamps[squareIndex] = true;
      }

      const oldWins = checkBingoLines(player.stamps || {}).winCount;
      const newWins = checkBingoLines(stamps).winCount;

      setRoomData((current) => ({
          ...current,
          players: {
              ...(current.players || {}),
              [myPlayerId]: {
                  ...(current.players?.[myPlayerId] || player),
                  name: myPlayerName,
                  stamps
              }
          }
      }));

      if (dbRef.current) {
          const playerRef = ref(dbRef.current, `wow_bingo_rooms/${currentRoomId}/players/${myPlayerId}`);
          const write = existingPlayer
              ? update(playerRef, {
                  name: myPlayerName,
                  [`stamps/${squareIndex}`]: wasStamped ? null : true
              })
              : set(playerRef, { ...player, name: myPlayerName, stamps });
          write.catch(handleDatabaseError);
      }

      if (!wasStamped) {
          playSound('stamp');
          if (newWins > oldWins) {
              setTimeout(() => playSound('bingo'), 300);
          }
      }
  };

  // Swap a wild card slot (e.g. "w2") with a board square index. The wild card's
  // text moves onto the board and the square's challenge moves into the wild card slot,
  // so dragging it back undoes the swap.
  const swapSlots = (boardIdx, wildKey) => {
      if (boardIdx === 12) return;
      const player = roomData.players?.[myPlayerId];
      if (!player) return;

      const boardKey = `s${boardIdx}`;
      const arrangement = { ...(player.arrangement || {}) };
      const pairedBoardKey = arrangement[wildKey]?.startsWith('s')
          ? arrangement[wildKey]
          : null;

      // A wild card stays paired with the board square it replaced.
      if (pairedBoardKey && boardKey !== pairedBoardKey) return;
      if (!pairedBoardKey && (arrangement[boardKey] || '').startsWith('w')) return;

      const boardCurrent = arrangement[boardKey] || boardKey;
      const wildCurrent = arrangement[wildKey] || wildKey;

      // Swap what each position displays; drop entries that return to default
      const next = { [boardKey]: wildCurrent, [wildKey]: boardCurrent };
      const updates = {};
      Object.entries(next).forEach(([pos, item]) => {
          if (item === pos) {
              delete arrangement[pos];
              updates[`arrangement/${pos}`] = null;
          } else {
              arrangement[pos] = item;
              updates[`arrangement/${pos}`] = item;
          }
      });

      // A newly swapped-in challenge hasn't been completed yet
      const stamps = { ...(player.stamps || {}) };
      delete stamps[boardIdx];
      updates[`stamps/${boardIdx}`] = null;

      setRoomData((current) => ({
          ...current,
          players: {
              ...(current.players || {}),
              [myPlayerId]: { ...player, arrangement, stamps }
          }
      }));

      if (dbRef.current) {
          const playerRef = ref(dbRef.current, `wow_bingo_rooms/${currentRoomId}/players/${myPlayerId}`);
          update(playerRef, updates).catch(handleDatabaseError);
      }
      playSound('wildcardSwap');
  };

  const changeMyNamePrompt = () => {
      const newName = prompt("Enter your character / player name:", myPlayerName);
      if (!newName || !newName.trim()) return;
      const cleanName = newName.trim();
      setMyPlayerName(cleanName);
      localStorage.setItem('wow_bingo_user_name', cleanName);

      if (roomData.players[myPlayerId]) {
          const playerRef = ref(dbRef.current, `wow_bingo_rooms/${currentRoomId}/players/${myPlayerId}`);
          update(playerRef, { name: cleanName }).catch(handleDatabaseError);
      }
  };

  const updateCardSeed = (seed) => {
      const existingPlayer = roomData.players?.[myPlayerId] || {
          id: myPlayerId,
          name: myPlayerName,
          stamps: { 12: true }
      };
      // Changing the seed reshuffles the card, so clear any wild card swaps
      const updatedPlayer = { ...existingPlayer, seed, arrangement: null };
      setRoomData((current) => ({
          ...current,
          players: { ...(current.players || {}), [myPlayerId]: updatedPlayer }
      }));
      if (!dbRef.current) return;
      const playerRef = ref(dbRef.current, `wow_bingo_rooms/${currentRoomId}/players/${myPlayerId}`);
      update(playerRef, updatedPlayer).catch(handleDatabaseError);
  };

  const randomizeActiveCard = () => {
      const randomSeed = Math.random().toString(36).substring(2, 8).toUpperCase();
      updateCardSeed(randomSeed);
  };

  const shareRoomLink = () => {
      const baseUrl = window.location.href.split('?')[0];
      const shareableUrl = `${baseUrl}?room=${encodeURIComponent(currentRoomId)}`;
      navigator.clipboard.writeText(shareableUrl);
      alert("Room link copied to clipboard:\n" + shareableUrl);
  };

  const sharePlayerSessionLink = () => {
      const shareableUrl = new URL(window.location.href);
      shareableUrl.searchParams.set('room', currentRoomId);
      shareableUrl.searchParams.set('player', myPlayerId);
      navigator.clipboard.writeText(shareableUrl.toString());
      alert("Player session link copied to clipboard. Anyone with this link can use this player's card:\n" + shareableUrl);
  };

  const resetBoard = async () => {
      const confirmed = window.confirm(
          `Reset the board for room ${currentRoomId}? Player names and IDs will stay, but all stamps and card seeds will reset.`
      );
      if (!confirmed || !dbRef.current) return;

      setSyncStatus({ text: 'Resetting boards...', color: 'text-amber-400' });
      const roomRef = ref(dbRef.current, `wow_bingo_rooms/${currentRoomId}`);
      const resetPlayers = Object.fromEntries(
          Object.entries(roomData.players || {}).map(([playerId, player]) => [playerId, {
              ...player,
              id: player.id || playerId,
              name: player.name || 'Mankrik',
              seed: 'BARRENS2026',
              stamps: { 12: true },
              arrangement: null
          }])
      );
      try {
          await set(roomRef, { seed: 'BARRENS2026', players: resetPlayers });
          setRoomData({ seed: 'BARRENS2026', players: resetPlayers });
          setActiveViewPlayerId(myPlayerId);
          setSyncStatus({ text: 'Boards reset', color: 'text-amber-400' });
      } catch (error) {
          handleDatabaseError(error);
      }
  };

  const resetRoom = async () => {
      const confirmed = window.confirm(
          `Delete all users and sessions from room ${currentRoomId}? This permanently removes every player name, card seed, and stamp from this room.`
      );
      if (!confirmed || !dbRef.current) return;

      setSyncStatus({ text: 'Resetting room...', color: 'text-amber-400' });
      const roomRef = ref(dbRef.current, `wow_bingo_rooms/${currentRoomId}`);
      try {
          await set(roomRef, { seed: 'BARRENS2026', players: {} });
          setRoomData({ seed: 'BARRENS2026', players: {} });
          setActiveViewPlayerId(myPlayerId);
          setSyncStatus({ text: 'All room users removed', color: 'text-amber-400' });
      } catch (error) {
          handleDatabaseError(error);
      }
  };

  const changeRoom = (event) => {
      event.preventDefault();
      const nextRoomId = roomCodeDraft.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{1,32}$/.test(nextRoomId)) {
          setSyncStatus({ text: 'Room code: use 1-32 letters, numbers, _ or -', color: 'text-red-400' });
          return;
      }

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('room', nextRoomId);
      nextUrl.searchParams.delete('player');
      window.location.assign(nextUrl.toString());
  };

  const allPlayers = Object.values(roomData.players || {});
  const displayPlayerId = activeViewPlayerId || myPlayerId;
  const activeViewPlayer = roomData.players[displayPlayerId] || { id: myPlayerId, name: myPlayerName, stamps: { 12: true } };

    const activeSeed = activeViewPlayer.seed ?? roomData.seed ?? 'BARRENS2026';
    const activeItems = generateCardItems(activeSeed);
    const slotTexts = getSlotTexts(activeSeed);
    const activeArrangement = activeViewPlayer.arrangement || {};
    const itemAt = (key) => slotTexts[activeArrangement[key] || key];
  const activeStamps = activeViewPlayer.stamps || {};
  const { winCount: activeWins, winningIndices } = checkBingoLines(activeStamps);
  const stampedTotal = Object.keys(activeStamps).filter(k => activeStamps[k]).length;
  const isEditingOwnCard = activeViewPlayer.id === myPlayerId;

  const sortedPlayers = [...allPlayers].sort((a, b) => {
      const winsA = checkBingoLines(a.stamps || {}).winCount;
      const winsB = checkBingoLines(b.stamps || {}).winCount;
      if (winsB !== winsA) return winsB - winsA;
      const countA = Object.keys(a.stamps || {}).filter(k => a.stamps[k]).length;
      const countB = Object.keys(b.stamps || {}).filter(k => b.stamps[k]).length;
      return countB - countA;
  });

  return (
    <div className="flex flex-col min-h-screen text-gray-200">
        {isFlashbangActive && (
            <div className="flashbang-overlay" aria-hidden="true" />
        )}
        <header className="no-print bg-[#1a1414] border-b border-[#3f2d2d] sticky top-0 z-40 shadow-xl">
            <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#8b0000] flex items-center justify-center border border-red-500 shadow-md">
                        <i className="fa-solid fa-horde text-amber-400 text-2xl"></i>
                    </div>
                    <div>
                        <h1 className="text-xl md:text-2xl font-black font-['Cinzel'] tracking-wider text-amber-500 flex items-center gap-2">
                            SEND IBUPROFEN
                            <span className="text-xs font-sans px-2 py-0.5 bg-red-950 text-red-300 rounded border border-red-800 uppercase tracking-widest font-semibold">WoW Horde Live</span>
                        </h1>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                            <form onSubmit={changeRoom} className="flex items-center gap-1.5">
                                <label htmlFor="room-code" className="text-gray-400">Room:</label>
                                <input
                                    id="room-code"
                                    type="text"
                                    value={roomCodeDraft}
                                    onChange={(event) => setRoomCodeDraft(event.target.value)}
                                    aria-label="Room code"
                                    maxLength={32}
                                    className="w-28 bg-[#0e0b0b] border border-[#3f2d2d] text-amber-300 font-mono px-2 py-1 rounded text-xs text-center uppercase"
                                />
                                <button type="submit" className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600 rounded text-xs font-semibold">
                                    Go
                                </button>
                                <button type="button" onClick={resetRoom} className="px-2 py-1 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 rounded text-xs font-semibold">
                                    Reset Room
                                </button>
                            </form>
                            <span className={`flex items-center gap-1 ${syncStatus.color}`}><i className="fa-solid fa-signal text-[10px]"></i> {syncStatus.text}</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={changeMyNamePrompt} className="px-3 py-1.5 bg-[#8b0000] hover:bg-red-600 text-white rounded-lg text-xs font-bold border border-red-500/50 flex items-center gap-1.5">
                        <i className="fa-solid fa-user"></i> Identity: <span className="text-amber-300">{myPlayerName}</span>
                    </button>
                    <button onClick={() => setActiveModal('pool')} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-semibold border border-gray-600/40 flex items-center gap-1.5">
                        <i className="fa-solid fa-list-check text-amber-500"></i> Edit Pool
                    </button>
                </div>
            </div>
        </header>

        <main className="flex-grow max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
            <section className="lg:col-span-3 flex flex-col gap-4">
                <div className="no-print bg-[#1a1414] p-2 rounded-xl border border-[#3f2d2d] flex items-center justify-between gap-2 overflow-x-auto">
                    <div className="flex items-center gap-2 overflow-x-auto py-1">
                        {allPlayers.map(player => {
                            const isSelected = player.id === activeViewPlayer.id;
                            const isMe = player.id === myPlayerId;
                            const { winCount } = checkBingoLines(player.stamps || {});
                            return (
                                <button
                                    key={player.id}
                                    onClick={() => setActiveViewPlayerId(player.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 border whitespace-nowrap ${
                                        isSelected ? 'bg-[#8b0000] text-white border-red-500 shadow-md' : 'bg-[#0e0b0b] text-gray-400 border-[#3f2d2d] hover:bg-gray-800'
                                    }`}
                                >
                                    <i className="fa-solid fa-user text-[10px]"></i>
                                    <span>{player.name} {isMe ? '(You)' : ''}</span>
                                    {winCount > 0 && <span className="bg-amber-400 text-black px-1.5 py-0.2 rounded-full text-[10px] font-black">{winCount} BINGO</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="no-print bg-[#1a1414] p-4 rounded-xl border border-[#3f2d2d] flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="text-amber-400 font-['Cinzel'] text-2xl font-bold flex items-center gap-2">
                            <i className="fa-solid fa-shield-halved text-red-500"></i>
                            <span>{activeViewPlayer.name}'s Card {isEditingOwnCard ? '(Your Board)' : '(Viewing)'}</span>
                        </div>
                        {activeWins > 0 && (
                            <span className="px-3 py-0.5 bg-amber-500 text-black font-black text-xs rounded-full uppercase tracking-wider bingo-glow">
                                {activeWins} BINGO{activeWins > 1 ? 'S' : ''}!
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                        <div>
                            <span className="text-gray-400">Card Seed:</span>
                            <input
                                type="text"
                                value={activeSeed}
                                disabled={!isEditingOwnCard}
                                onChange={(e) => updateCardSeed(e.target.value)}
                                className="ml-1 bg-[#0e0b0b] border border-[#3f2d2d] text-amber-300 font-mono px-2 py-1 rounded text-xs w-28 text-center"
                            />
                        </div>
                        <div>
                            <span className="text-gray-400">Stamped:</span>
                            <span className="font-bold text-amber-400 text-sm ml-1">{stampedTotal}/25</span>
                        </div>
                        <button onClick={randomizeActiveCard} disabled={!isEditingOwnCard} className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 text-xs flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
                            <i className="fa-solid fa-dice"></i> Shuffle
                        </button>
                    </div>
                </div>

                <div className="bg-[#1a1414] p-3 md:p-5 rounded-2xl border-2 border-[#3f2d2d] shadow-2xl relative flex gap-2 md:gap-4">
                    {/* Wild card column */}
                    <div className="flex flex-col w-20 md:w-36 shrink-0">
                        <div className="mb-2 md:mb-3 py-1 text-center bg-[#0e0b0b] rounded border border-amber-900/60 font-['Cinzel'] font-extrabold text-lg md:text-2xl text-amber-400 tracking-widest">
                            <i className="fa-solid fa-wand-sparkles"></i>
                        </div>
                        <div className="grid grid-rows-5 gap-1.5 md:gap-3 flex-1">
                            {WILDCARDS.map((_, w) => {
                                const key = `w${w}`;
                                const isSelected = selectedWild === key;
                                return (
                                    <div
                                        key={key}
                                        draggable={isEditingOwnCard}
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('text/plain', key);
                                            e.dataTransfer.effectAllowed = 'move';
                                            setDraggedWild(key);
                                            setSelectedWild(null);
                                        }}
                                        onDragEnd={() => { setDraggedWild(null); setDragOverIdx(null); }}
                                        onClick={() => {
                                            if (!isEditingOwnCard) return;
                                            setSelectedWild(isSelected ? null : key);
                                        }}
                                        className={`p-2 rounded-xl border-2 border-dashed flex items-center justify-center text-center select-none min-h-[90px] md:min-h-[115px] text-[9px] md:text-xs font-semibold leading-snug bg-amber-950/30 text-amber-200 ${
                                            isEditingOwnCard ? 'cursor-grab active:cursor-grabbing hover:bg-amber-900/30' : 'cursor-default'
                                        } ${isSelected ? 'border-amber-300 ring-2 ring-amber-400' : 'border-amber-700/70'}`}
                                    >
                                        {itemAt(key)}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Main board */}
                    <div className="flex-1 min-w-0">
                        <div className="grid grid-cols-5 gap-1.5 md:gap-3 mb-2 md:mb-3 text-center font-['Cinzel'] font-extrabold text-lg md:text-2xl text-amber-500 tracking-widest">
                            <div className="py-1 bg-[#0e0b0b] rounded border border-red-950/40">B</div>
                            <div className="py-1 bg-[#0e0b0b] rounded border border-red-950/40">I</div>
                            <div className="py-1 bg-[#0e0b0b] rounded border border-red-950/40">N</div>
                            <div className="py-1 bg-[#0e0b0b] rounded border border-red-950/40">G</div>
                            <div className="py-1 bg-[#0e0b0b] rounded border border-red-950/40">O</div>
                        </div>

                        <div className="bingo-grid grid grid-cols-5 gap-1.5 md:gap-3">
                            {activeItems.map((_, idx) => {
                                const text = itemAt(`s${idx}`);
                                const isStamped = !!activeStamps[idx];
                                const isWinningSquare = winningIndices.has(idx);
                                const isFreeSpace = idx === 12;
                                const canReceiveWild = isEditingOwnCard && !isFreeSpace;

                                return (
                                    <div
                                        key={idx}
                                        onClick={() => {
                                            if (selectedWild && canReceiveWild) {
                                                swapSlots(idx, selectedWild);
                                                setSelectedWild(null);
                                                return;
                                            }
                                            toggleSquareStamp(activeViewPlayer.id, idx);
                                        }}
                                        onDragOver={(e) => {
                                            if (draggedWild && canReceiveWild) {
                                                e.preventDefault();
                                                setDragOverIdx(idx);
                                            }
                                        }}
                                        onDragLeave={() => setDragOverIdx((cur) => (cur === idx ? null : cur))}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            const key = e.dataTransfer.getData('text/plain') || draggedWild;
                                            if (canReceiveWild && key && key.startsWith('w')) swapSlots(idx, key);
                                            setDraggedWild(null);
                                            setDragOverIdx(null);
                                        }}
                                        className={`bingo-square relative p-2 md:p-3 rounded-xl border flex flex-col justify-between items-center text-center select-none min-h-[90px] md:min-h-[115px] ${
                                            isEditingOwnCard ? 'cursor-pointer' : 'cursor-default'
                                        } ${dragOverIdx === idx ? 'ring-2 ring-amber-400 scale-[1.03]' : ''} ${
                                            selectedWild && canReceiveWild ? 'ring-1 ring-amber-500/50' : ''
                                        } ${
                                            isWinningSquare
                                                ? 'bg-gradient-to-b from-amber-950/80 to-red-950/80 border-amber-500 shadow-lg font-bold'
                                                : isStamped
                                                ? 'bg-red-950/60 border-red-800 text-amber-200 stamped'
                                                : 'bg-[#0e0b0b] hover:bg-gray-800/80 border-[#3f2d2d] text-gray-300'
                                        }`}
                                    >
                                        <div className={`text-[10px] md:text-xs font-semibold leading-snug ${isFreeSpace ? 'text-amber-400 font-bold font-["Cinzel"]' : ''}`}>
                                            {text}
                                        </div>
                                        {isStamped ? (
                                            <div className="stamp-badge stamp-animated text-red-500 text-2xl md:text-3xl mt-1">
                                                <i className="fa-solid fa-shield-halved"></i>
                                            </div>
                                        ) : (
                                            <div className="text-gray-600 text-xs mt-1">
                                                <i className="fa-regular fa-square"></i>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </section>

            <aside className="no-print flex flex-col gap-4">
                <div className="bg-[#1a1414] p-4 rounded-xl border border-[#3f2d2d] flex flex-col h-full shadow-lg">
                    <div className="flex items-center justify-between border-b border-[#3f2d2d] pb-3 mb-3">
                        <h2 className="text-sm font-bold font-['Cinzel'] uppercase tracking-wider text-amber-400 flex items-center gap-2">
                            <i className="fa-solid fa-trophy text-amber-500"></i> Live Standings
                        </h2>
                        <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full font-mono">{sortedPlayers.length} Players</span>
                    </div>

                    <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[500px] pr-1">
                        {sortedPlayers.map((player, rank) => {
                            const stamps = player.stamps || {};
                            const count = Object.keys(stamps).filter(k => stamps[k]).length;
                            const { winCount } = checkBingoLines(stamps);
                            const isMe = player.id === myPlayerId;
                            return (
                                <div key={player.id} onClick={() => setActiveViewPlayerId(player.id)} className={`p-3 rounded-lg border cursor-pointer transition flex items-center justify-between ${player.id === activeViewPlayer.id ? 'bg-red-950/40 border-red-500' : 'bg-[#0e0b0b] border-[#3f2d2d] hover:bg-gray-800'}`}>
                                    <div className="flex items-center gap-2.5">
                                        <span className="font-mono text-xs text-amber-500 font-bold">#{rank + 1}</span>
                                        <div>
                                            <div className="text-xs font-bold text-gray-200">{player.name} {isMe ? '(You)' : ''}</div>
                                            <div className="text-[10px] text-gray-400">{count}/25 Stamped</div>
                                        </div>
                                    </div>
                                    {winCount > 0 && <span className="bg-amber-400 text-black px-2 py-0.5 rounded text-[10px] font-black">{winCount} BINGO</span>}
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-auto pt-4 border-t border-[#3f2d2d] flex items-center justify-between text-xs text-gray-400">
                        <span>Room: <strong className="text-gray-200">{currentRoomId}</strong></span>
                        <div className="flex items-center gap-3">
                            <button onClick={shareRoomLink} className="text-amber-400 hover:underline flex items-center gap-1">
                                <i className="fa-solid fa-share-nodes"></i> Invite to Room
                            </button>
                            <button onClick={sharePlayerSessionLink} className="text-amber-400 hover:underline flex items-center gap-1">
                                <i className="fa-solid fa-link"></i> Link This Player
                            </button>
                            <button onClick={resetBoard} className="text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1">
                                <i className="fa-solid fa-rotate"></i> Reset Board
                            </button>
                        </div>
                    </div>
                </div>
            </aside>
        </main>

        {activeModal === 'pool' && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#1a1414] border border-[#3f2d2d] rounded-2xl max-w-2xl w-full p-6 shadow-2xl horde-border flex flex-col max-h-[90vh]">
                    <div className="flex justify-between items-center mb-4 border-b border-[#3f2d2d] pb-3">
                        <h3 className="text-lg font-bold font-['Cinzel'] text-amber-400 flex items-center gap-2">
                            <i className="fa-solid fa-list-check"></i> Customize Master Challenge Pool
                        </h3>
                        <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-white"><i className="fa-solid fa-xmark text-lg"></i></button>
                    </div>
                    <div className="flex-grow overflow-y-auto mb-4 pr-1">
                        <p className="text-xs text-gray-400 mb-3">Add one challenge per line. At least 24 unique challenges required.</p>
                        <textarea
                            rows="12"
                            value={customPoolText}
                            onChange={(e) => setCustomPoolText(e.target.value)}
                            className="bg-[#0e0b0b] border border-[#3f2d2d] font-sans text-xs text-gray-200 p-3 rounded-xl w-full outline-none focus:border-amber-500 leading-relaxed"
                        ></textarea>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-[#3f2d2d]">
                        <button onClick={() => setCustomPoolText(DEFAULT_CHALLENGES.join('\n'))} className="px-3 py-1.5 bg-gray-800 text-gray-400 hover:text-white text-xs rounded-lg">Reset Default</button>
                        <button onClick={() => {
                            const newPool = customPoolText.split('\n').map(s => s.trim()).filter(Boolean);
                            if (newPool.length < 24) {
                                alert("Please provide at least 24 challenges for a full 5x5 board.");
                                return;
                            }
                            setMasterPool(newPool);
                            setActiveModal(null);
                        }} className="px-4 py-2 bg-[#8b0000] hover:bg-red-600 text-white text-xs font-bold rounded-lg">Save Pool Changes</button>
                    </div>
                </div>
            </div>
        )}

        <footer className="no-print mt-auto bg-[#1a1414] border-t border-[#3f2d2d] py-4 text-center text-xs text-gray-500">
            <p>Send Ibuprofen - WoW Horde Leveling Bingo &bull; Custom Release Week Challenge Card</p>
        </footer>
    </div>
  );
}
