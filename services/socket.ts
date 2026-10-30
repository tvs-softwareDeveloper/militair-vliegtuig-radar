import { io } from 'socket.io-client';
// OUD: const socket = io('http://localhost:3001');
//! het adres van de server, standaard localhost:3001. met VITE_SERVER (bij het bouwen) kies je een andere,
//! bijvoorbeeld een testserver op een andere poort die naast de echte draait
const socket = io((import.meta as any).env?.VITE_SERVER || 'http://localhost:3001');
export default socket;

