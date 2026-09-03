const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Estado global de la transmisión
let streamState = {
    isPlaying: false,
    startTime: null,      // Fecha/hora exacta de cuando se presionó "Iniciar"
    startOffset: 0       // Tiempo de inicio del video en segundos
};

io.on('connection', (socket) => {
	// Si la transmisión YA está en vivo cuando entra el usuario, le enviamos la posición actual exacta
    if (streamState.isPlaying) {
        const elapsedTime = (Date.now() - streamState.startTime) / 1000;
        const currentVideoTime = streamState.startOffset + elapsedTime;

        socket.emit('play-video', { 
            time: currentVideoTime,
            isPlaying: true 
        });
    }
    // Enviar estado actual al nuevo espectador que se conecta
    //socket.emit('sync-state', { time: currentVideoTime, playing: isPlaying });

    // Control del streamer (Panel de administración)
    socket.on('admin-play', (data) => {
        const initialTime = data.time || 0;
        streamState.isPlaying = true;
        streamState.startTime = Date.now();
        streamState.startOffset = initialTime;
        io.emit('play-video', { time: initialTime, isPlaying: true });
    });

    socket.on('admin-pause', () => {
        if (streamState.isPlaying) {
            // Guardar en qué segundo quedó pausado
            const elapsedTime = (Date.now() - streamState.startTime) / 1000;
            streamState.startOffset += elapsedTime;
            streamState.isPlaying = false;
        }
        io.emit('pause-video');
    });

    socket.on('admin-seek', (time) => {
        currentVideoTime = time;
        io.emit('seek-video', { time: currentVideoTime });
    });
	
	// NUEVO EVENTO: Reanudar reproducción
	socket.on('resume-video', () => {
		streamState.isPlaying = true;
        streamState.startTime = Date.now();
		io.emit('resume-video',{ time: streamState.startOffset });
	});

});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor activo en el puerto ${PORT}`);
});
