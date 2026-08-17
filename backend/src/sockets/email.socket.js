let activeSockets = {};

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`Neko X: socket ${socket.id} terhubung ><`);

    socket.on('subscribe-email', (emailInput) => {
      try {
        if (!emailInput || typeof emailInput !== 'string') {
          throw new Error('Email wajib diisi');
        }

        const email = emailInput.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new Error('Format email tidak valid');
        }

        activeSockets[socket.id] = email;
        console.log(`Neko X: ${email} terdaftar di socket ${socket.id}`);
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('disconnect', () => {
      delete activeSockets[socket.id];
      console.log(`Neko X: socket ${socket.id} putus`);
    });
  });

  // broadcast ke semua socket yang subscribe email tertentu
  global.broadcastNewEmail = (email, newMessage) => {
    const targetEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    for (const [sid, subscribedEmail] of Object.entries(activeSockets)) {
      if (subscribedEmail === targetEmail) {
        io.to(sid).emit('new-email', newMessage);
      }
    }
  };
};