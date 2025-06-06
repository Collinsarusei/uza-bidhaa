import { io, Socket } from 'socket.io-client';

let socket: Socket | undefined;

export const initSocket = () => {
  if (!socket) {
    socket = io('/api/socketio', {
      path: '/api/socketio',
      addTrailingSlash: false,
      transports: ['websocket'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('Socket connected');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });
  }
  return socket;
};

export const getSocket = () => {
  return socket;
};