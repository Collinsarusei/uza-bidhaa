import { Server } from 'socket.io'

const SocketHandler = (req: any, res: any) => {
  if (res.socket.server.io) {
    console.log('Socket is already running')
  } else {
    console.log('Socket is initializing')
    const io = new Server(res.socket.server, {
        transports: ['websocket']
    })
    res.socket.server.io = io

    io.on('connection', socket => {
        console.log('Connected:', socket.id)

        // Implement Keep-Alive
        const intervalId = setInterval(() => {
            socket.emit('ping');
        }, 15000); // Send ping every 15 seconds

        socket.on('pong', () => {
            console.log('Received pong from client:', socket.id);
        });

        socket.on('disconnect', () => {
            console.log('Disconnected:', socket.id)
            clearInterval(intervalId);
        })
        socket.on('new-message', (message) => {
            console.log('new message', message)
            socket.broadcast.emit('message-received', message)
        })
    })
  }
  res.end()
}

export default SocketHandler