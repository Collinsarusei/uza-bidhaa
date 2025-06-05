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
      socket.on('input change', msg => {
        socket.broadcast.emit('updateInput', msg)
      })
    })
  }
  res.end()
}

export default SocketHandler