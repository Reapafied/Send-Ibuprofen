import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

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
    "Stand next to King Anduin Wrynn in Stormwind Keep",
    "Ride the Deeprun Tram from Stormwind to Ironforge",
    "Get mind-controlled by an Alliance Priest & emote /dance",
    "Take a selfie/screenshot at the top of Darnassus Bank",
    "Attune to or click an Alliance Flight Master",
    "Exchange 3 friendly emotes with an Alliance player",
    "Defend Crossroads or Tarren Mill from an Alliance gank",
    "Pickpocket or loot an Alliance player corpse",
    "Get slain by an Alliance player 10+ levels lower",
    "Die to fall damage from Thousand Needles or TB Elevators",
    "Survive TB elevator ride without taking fall damage",
    "Get killed by Gazz'ril or The Oozing Slime in Barrens",
    "Die inside a crowded cave system",
    "Pull 5+ mobs by accident, run away, and survive",
    "Witness or post a Chuck Norris joke in Barrens Chat",
    "Equip hideous green gear solely for the stat upgrade",
    "Receive 3 unsolicited guild invites in a single zone",
    "Lose a /roll 100 for a dungeon item by less than 5 points",
    "Save a random player from dying in the open world",
    "Reach Level 20 and learn travel form / mount",
    "Complete a full dungeon run with 0 player wipes",
    "Get ganked while attempting to turn in a quest",
    "Kill an enemy player while at under 10% health",
    "Find and open a Locked Iron Chest in the open world",
    "Fish up a junk item or rare fish in enemy territory",
    "Successfully complete 50 total quests in your log",
    "Kite an elite monster into a Horde town or guard",
    "Buy gear or items from an Alliance Neutral Auction House"
];

const WIN_PATTERNS = [
    [0,1,2,3,4], [5,6,7,8,9], [10,11,12,13,14], [15,16,17,18,19], [20,21,22,23,24],
    [0,5,10,15,20], [1,6,11,16,21], [2,7,12,17,22], [3,8,13,18,23], [4,9,14,19,24],
    [0,6,12,18,24], [4,8,12,16,20]
];

export default function App() {
  const [currentRoomId, setCurrentRoomId] = useState('GLOBAL');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [masterPool, setMasterPool] = useState(DEFAULT_CHALLENGES);
  
  const [myPlayerId] = useState(() => {
      return localStorage.getItem('wow_bingo_user_id') || 'p_' + Math.random().toString(36).substring(2, 9);
  });
  const [myPlayerName, setMyPlayerName] = useState(() => {
      return localStorage.getItem('wow_bingo_user_name') || 'Mankrik';
  });

  const [roomData, setRoomData] = useState({
      seed: 'BARRENS2026',
      players: {}
  });

  const [activeViewPlayerId, setActiveViewPlayerId] = useState('');
  const [syncStatus, setSyncStatus] = useState({ text: 'Connecting...', color: 'text-amber-400' });
  
  const [activeModal, setActiveModal] = useState(null);
  const [customPoolText, setCustomPoolText] = useState(DEFAULT_CHALLENGES.join('\n'));

  const dbRef = useRef(null);

  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const urlRoom = params.get('room')?.toUpperCase() || 'GLOBAL';
      setCurrentRoomId(urlRoom);

      try {
          const app = !getApps().length ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
          const database = getDatabase(app);
          dbRef.current = database;
          setSyncStatus({ text: 'Firebase Connected', color: 'text-amber-400' });
          subscribeToRoom(urlRoom, database);
      } catch (err) {
          console.error("Firebase initialization failed:", err);
          setSyncStatus({ text: 'Config Error', color: 'text-red-500' });
      }
  }, []);
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
      return null;
  };

  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const urlRoom = params.get('room')?.toUpperCase() || 'GLOBAL';
      setCurrentRoomId(urlRoom);

      const config = getFirebaseConfig();

      if (config && config.databaseURL) {
          try {
              const app = !getApps().length ? initializeApp(config) : getApps()[0];
              const database = getDatabase(app);
              dbRef.current = database;
              setSyncStatus({ text: 'Firebase Connected', color: 'text-amber-400' });
              subscribeToRoom(urlRoom, database);
          } catch (err) {
              console.error("Firebase initialization failed:", err);
              setSyncStatus({ text: 'Config Error', color: 'text-red-500' });
          }
      } else {
          setSyncStatus({ text: 'No Secret Config Found', color: 'text-red-400' });
      }
  }, []);

  const subscribeToRoom = (roomId, database = dbRef.current) => {
      if (!database) return;
      setCurrentRoomId(roomId);

      const roomNodeRef = ref(database, `wow_bingo_rooms/${roomId}`);
      onValue(roomNodeRef, (snapshot) => {
          const val = snapshot.val();
          if (val) {
              setRoomData(val);
              if (!val.players?.[myPlayerId]) {
                  registerUserInRoom(roomId, database, val);
              }
          } else {
              const initialData = {
                  seed: 'BARRENS2026',
                  players: {
                      [myPlayerId]: { id: myPlayerId, name: myPlayerName, stamps: { 12: true } }
                  }
              };
              set(roomNodeRef, initialData);
              setRoomData(initialData);
          }
      });
  };

  const registerUserInRoom = (roomId, database, existingRoomData) => {
      const updatedPlayers = {
          ...(existingRoomData.players || {}),
          [myPlayerId]: { id: myPlayerId, name: myPlayerName, stamps: { 12: true } }
      };
      const playersRef = ref(database, `wow_bingo_rooms/${roomId}/players`);
      set(playersRef, updatedPlayers);
  };

  const pushRoomUpdate = (newRoomData) => {
      setRoomData(newRoomData);
      if (dbRef.current) {
          const roomNodeRef = ref(dbRef.current, `wow_bingo_rooms/${currentRoomId}`);
          set(roomNodeRef, newRoomData);
      }
  };

  const playSound = (type) => {
      if (!audioEnabled) return;
      try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          const now = ctx.currentTime;

          if (type === 'stamp') {
              osc.type = 'sine';
              osc.frequency.setValueAtTime(180, now);
              osc.frequency.exponentialRampToValueAtTime(320, now + 0.08);
              gain.gain.setValueAtTime(0.3, now);
              gain.gain.linearRampToValueAtTime(0, now + 0.1);
              osc.start(now);
              osc.stop(now + 0.1);
          } else if (type === 'bingo') {
              osc.type = 'triangle';
              osc.frequency.setValueAtTime(440, now);
              osc.frequency.setValueAtTime(554.37, now + 0.12);
              osc.frequency.setValueAtTime(659.25, now + 0.24);
              gain.gain.setValueAtTime(0.4, now);
              gain.gain.linearRampToValueAtTime(0, now + 0.5);
              osc.start(now);
              osc.stop(now + 0.5);
          }
      } catch (e) {
          console.warn("Audio Context error:", e);
      }
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

  const generateCardItems = (seed, playerUniqueKey) => {
      const rng = seededRandom(seed + '_' + playerUniqueKey);
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

      const updatedPlayers = { ...roomData.players };
      const player = updatedPlayers[myPlayerId] || { id: myPlayerId, name: myPlayerName, stamps: { 12: true } };

      const stamps = { ...(player.stamps || {}) };
      const wasStamped = !!stamps[squareIndex];
      stamps[squareIndex] = !wasStamped;

      const oldWins = checkBingoLines(player.stamps || {}).winCount;
      const newWins = checkBingoLines(stamps).winCount;

      player.stamps = stamps;
      player.name = myPlayerName;
      updatedPlayers[myPlayerId] = player;

      pushRoomUpdate({ ...roomData, players: updatedPlayers });

      if (!wasStamped) {
          playSound('stamp');
          if (newWins > oldWins) {
              setTimeout(() => playSound('bingo'), 300);
          }
      }
  };

  const changeMyNamePrompt = () => {
      const newName = prompt("Enter your character / player name:", myPlayerName);
      if (!newName || !newName.trim()) return;
      const cleanName = newName.trim();
      setMyPlayerName(cleanName);

      if (roomData.players[myPlayerId]) {
          const updatedPlayers = {
              ...roomData.players,
              [myPlayerId]: { ...roomData.players[myPlayerId], name: cleanName }
          };
          pushRoomUpdate({ ...roomData, players: updatedPlayers });
      }
  };

  const updateCardSeed = (newSeed) => {
      pushRoomUpdate({ ...roomData, seed: newSeed || 'BARRENS2026' });
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

  const allPlayers = Object.values(roomData.players || {});
  const displayPlayerId = activeViewPlayerId || myPlayerId;
  const activeViewPlayer = roomData.players[displayPlayerId] || { id: myPlayerId, name: myPlayerName, stamps: { 12: true } };

  const activeItems = generateCardItems(roomData.seed || 'BARRENS2026', activeViewPlayer.id);
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
                            <span>Room Code: <strong className="text-amber-300 font-mono">{currentRoomId}</strong></span>
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
                    <button onClick={() => setAudioEnabled(!audioEnabled)} className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs" title="Toggle Audio">
                        <i className={`fa-solid ${audioEnabled ? 'fa-volume-high text-amber-500' : 'fa-volume-xmark text-gray-500'}`}></i>
                    </button>
                    <button onClick={() => setActiveModal('print')} className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-xs font-bold border border-amber-500/50 flex items-center gap-1.5">
                        <i className="fa-solid fa-print"></i> Print
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
                                value={roomData.seed || 'BARRENS2026'}
                                onChange={(e) => updateCardSeed(e.target.value)}
                                className="ml-1 bg-[#0e0b0b] border border-[#3f2d2d] text-amber-300 font-mono px-2 py-1 rounded text-xs w-28 text-center"
                            />
                        </div>
                        <div>
                            <span className="text-gray-400">Stamped:</span>
                            <span className="font-bold text-amber-400 text-sm ml-1">{stampedTotal}/25</span>
                        </div>
                        <button onClick={randomizeActiveCard} className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 text-xs flex items-center gap-1">
                            <i className="fa-solid fa-dice"></i> Shuffle
                        </button>
                    </div>
                </div>

                <div className="bg-[#1a1414] p-3 md:p-5 rounded-2xl border-2 border-[#3f2d2d] shadow-2xl relative">
                    <div className="grid grid-cols-5 gap-1.5 md:gap-3 mb-2 md:mb-3 text-center font-['Cinzel'] font-extrabold text-lg md:text-2xl text-amber-500 tracking-widest">
                        <div className="py-1 bg-[#0e0b0b] rounded border border-red-950/40">B</div>
                        <div className="py-1 bg-[#0e0b0b] rounded border border-red-950/40">I</div>
                        <div className="py-1 bg-[#0e0b0b] rounded border border-red-950/40">N</div>
                        <div className="py-1 bg-[#0e0b0b] rounded border border-red-950/40">G</div>
                        <div className="py-1 bg-[#0e0b0b] rounded border border-red-950/40">O</div>
                    </div>

                    <div className="bingo-grid grid grid-cols-5 gap-1.5 md:gap-3">
                        {activeItems.map((text, idx) => {
                            const isStamped = !!activeStamps[idx];
                            const isWinningSquare = winningIndices.has(idx);
                            const isFreeSpace = idx === 12;

                            return (
                                <div
                                    key={idx}
                                    onClick={() => toggleSquareStamp(activeViewPlayer.id, idx)}
                                    className={`bingo-square relative p-2 md:p-3 rounded-xl border flex flex-col justify-between items-center text-center select-none min-h-[90px] md:min-h-[115px] ${
                                        isEditingOwnCard ? 'cursor-pointer' : 'cursor-default'
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
                        <button onClick={shareRoomLink} className="text-amber-400 hover:underline flex items-center gap-1">
                            <i className="fa-solid fa-share-nodes"></i> Share Link
                        </button>
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

        {activeModal === 'print' && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#1a1414] border border-[#3f2d2d] rounded-2xl max-w-md w-full p-6 shadow-2xl horde-border">
                    <div className="flex justify-between items-center mb-4 border-b border-[#3f2d2d] pb-3">
                        <h3 className="text-lg font-bold font-['Cinzel'] text-amber-400 flex items-center gap-2">
                            <i className="fa-solid fa-print"></i> Print Bingo Cards
                        </h3>
                        <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-white"><i className="fa-solid fa-xmark text-lg"></i></button>
                    </div>
                    <div className="space-y-3 mb-6 text-xs text-gray-300">
                        <p>Page formatting strips dark backgrounds for high-contrast ink printing.</p>
                        <label className="flex items-center gap-2 cursor-pointer pt-2">
                            <input type="radio" name="print-option" checked readOnly className="accent-amber-500" />
                            <span>Print Currently Displayed Card (<strong className="text-amber-400">{activeViewPlayer.name}</strong>)</span>
                        </label>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => { setActiveModal(null); window.print(); }} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black text-xs font-bold rounded-lg flex items-center gap-1.5">
                            <i className="fa-solid fa-print"></i> Open Print Dialog
                        </button>
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