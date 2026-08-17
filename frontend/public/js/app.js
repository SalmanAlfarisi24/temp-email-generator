const socket = io();

// DOM Elements
const socketStatus = document.getElementById('socketStatus');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Socket connection
socket.on('connect', () => {
  socketStatus.textContent = '● online';
  socketStatus.className = 'online';
});

socket.on('disconnect', () => {
  socketStatus.textContent = '● offline';
  socketStatus.className = 'offline';
});

socket.on('inbox-update', (data) => {
  if (window.updateInboxUI) {
    window.updateInboxUI(data);
  }
});

socket.on('new-email', (data) => {
  if (window.addNewEmail) {
    window.addNewEmail(data);
  }
});

// Tab switching
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    tabContents.forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
  });
});