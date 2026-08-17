const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// routes
const tempMailRoutes = require('./routes/tempMail.routes');
const aliasRoutes = require('./routes/alias.routes');

// socket handler
const emailSocket = require('./sockets/email.socket');

// config
const config = require('./config');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || config.port || 3000;

// middleware
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../frontend/public')));

// routes
app.use('/api/temp-mail', tempMailRoutes);
app.use('/api/alias', aliasRoutes);

// health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
});

// error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  const status = err.status || 500;
  const message = status === 500 ? 'Internal server error' : err.message;
  res.status(status).json({ success: false, message });
});

// socket
emailSocket(io);

server.listen(PORT, () => {
  console.log(`Neko X ready di http://localhost:${PORT} ><`);
});