import { createServer } from 'http'
import { Server } from 'socket.io'

const PORT = 3003

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

interface ConnectedUser {
  userId: string
  inquiryId: string
}

const connectedUsers = new Map<string, ConnectedUser>()

io.on('connection', (socket) => {
  console.log(`[Chat] User connected: ${socket.id}`)

  // Join an inquiry chat room
  socket.on('join-room', (data: { userId: string; inquiryId: string }) => {
    const { userId, inquiryId } = data

    // Leave previous room if any
    const prev = connectedUsers.get(socket.id)
    if (prev) {
      socket.leave(`inquiry:${prev.inquiryId}`)
      // Notify previous room that user stopped typing
      socket.to(`inquiry:${prev.inquiryId}`).emit('stop-typing', {
        userId: prev.userId,
        inquiryId: prev.inquiryId,
      })
    }

    // Join new room
    socket.join(`inquiry:${inquiryId}`)
    connectedUsers.set(socket.id, { userId, inquiryId })

    // Notify room that user is online
    socket.to(`inquiry:${inquiryId}`).emit('user-online', {
      userId,
      inquiryId,
    })

    // Send list of online users in this room
    const onlineUsers: string[] = []
    for (const [, user] of connectedUsers) {
      if (user.inquiryId === inquiryId) {
        onlineUsers.push(user.userId)
      }
    }
    socket.emit('online-users', { inquiryId, users: onlineUsers })

    console.log(`[Chat] User ${userId} joined inquiry ${inquiryId}`)
  })

  // Send message to room
  socket.on('send-message', (data: { userId: string; userName: string; inquiryId: string; content: string; messageId: string }) => {
    const { userId, userName, inquiryId, content, messageId } = data

    // Broadcast to everyone in the room (including sender for confirmation)
    io.to(`inquiry:${inquiryId}`).emit('new-message', {
      id: messageId,
      content,
      senderId: userId,
      senderName: userName,
      inquiryId,
      createdAt: new Date().toISOString(),
    })

    console.log(`[Chat] Message from ${userName} in inquiry ${inquiryId}: ${content.substring(0, 50)}...`)
  })

  // Typing indicator
  socket.on('typing', (data: { userId: string; userName: string; inquiryId: string }) => {
    socket.to(`inquiry:${data.inquiryId}`).emit('typing', {
      userId: data.userId,
      userName: data.userName,
      inquiryId: data.inquiryId,
    })
  })

  // Stop typing indicator
  socket.on('stop-typing', (data: { userId: string; inquiryId: string }) => {
    socket.to(`inquiry:${data.inquiryId}`).emit('stop-typing', {
      userId: data.userId,
      inquiryId: data.inquiryId,
    })
  })

  // Mark messages as read
  socket.on('mark-read', (data: { userId: string; inquiryId: string }) => {
    socket.to(`inquiry:${data.inquiryId}`).emit('messages-read', {
      userId: data.userId,
      inquiryId: data.inquiryId,
    })
  })

  // Disconnect
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id)
    if (user) {
      const { userId, inquiryId } = user
      // Notify room that user is offline
      socket.to(`inquiry:${inquiryId}`).emit('user-offline', {
        userId,
        inquiryId,
      })
      // Stop typing if was typing
      socket.to(`inquiry:${inquiryId}`).emit('stop-typing', {
        userId,
        inquiryId,
      })
      connectedUsers.delete(socket.id)
      console.log(`[Chat] User ${userId} disconnected from inquiry ${inquiryId}`)
    } else {
      console.log(`[Chat] Unknown user disconnected: ${socket.id}`)
    }
  })

  socket.on('error', (error) => {
    console.error(`[Chat] Socket error (${socket.id}):`, error)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[Chat] Chat service running on port ${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Chat] Received SIGTERM, shutting down...')
  io.close()
  httpServer.close(() => {
    console.log('[Chat] Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('[Chat] Received SIGINT, shutting down...')
  io.close()
  httpServer.close(() => {
    console.log('[Chat] Server closed')
    process.exit(0)
  })
})
