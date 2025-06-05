import { Server as SocketIOServer } from 'socket.io';
import { Server as NetServer } from 'http';

declare module 'socket.io' {
  interface Server {
    use(fn: (socket: Socket, next: (err?: Error) => void) => void): this;
    on(event: string, listener: (socket: Socket) => void): this;
    emit(event: string, ...args: any[]): boolean;
    to(room: string): {
      emit(event: string, ...args: any[]): boolean;
    };
  }

  interface Socket {
    id: string;
    data: {
      userId?: string;
    };
    join(room: string): void;
    leave(room: string): void;
    to(room: string): {
      emit(event: string, ...args: any[]): boolean;
    };
    disconnect(): void;
  }
}

declare global {
  var io: SocketIOServer | null;
} 