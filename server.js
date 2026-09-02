const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let currentVideoTime = 0;
let isPlaying = false;

io.on('connection', (socket) => {
    // Enviar estado actual al nuevo espectador que se conecta
    socket.emit('sync-state', { time: currentVideoTime, playing: isPlaying });

    // Control del streamer (Panel de administración)
    socket.on('admin-play', (data) => {
        isPlaying = true;
        currentVideoTime = data.time || 0;
        io.emit('play-video', { time: currentVideoTime });
    });

    socket.on('admin-pause', () => {
        isPlaying = false;
        io.emit('pause-video');
    });

    socket.on('admin-seek', (time) => {
        currentVideoTime = time;
        io.emit('seek-video', { time: currentVideoTime });
    });
	
	socket.on('play-video', (data) => {
		io.emit('play-video', data);
	});

	socket.on('pause-video', () => {
		io.emit('pause-video');
	});

	// NUEVO EVENTO: Reanudar reproducción
	socket.on('resume-video', () => {
		io.emit('resume-video');
	});
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor activo en el puerto ${PORT}`);
});
