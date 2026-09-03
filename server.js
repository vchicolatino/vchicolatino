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
    startOffset: 0,       // Tiempo de inicio del video en segundos
    titleTop: "Título por defecto",    // Texto del Label superior
    titleBottom: "Mensaje por defecto" // Texto del Label inferior
};

io.on('connection', (socket) => {
    // Enviar estado actual (video y títulos) al nuevo espectador que se conecta
    if (streamState.isPlaying) {
        const elapsedTime = (Date.now() - streamState.startTime) / 1000;
        const currentVideoTime = streamState.startOffset + elapsedTime;

        socket.emit('play-video', { 
            time: currentVideoTime,
            isPlaying: true 
        });
    }

    // Enviar los títulos actuales al conectarse
    socket.emit('update-titles', {
        titleTop: streamState.titleTop,
        titleBottom: streamState.titleBottom
    });

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
	
    socket.on('resume-video', () => {
        streamState.isPlaying = true;
        streamState.startTime = Date.now();
        io.emit('resume-video',{ time: streamState.startOffset });
    });

    // NUEVO EVENTO: Actualizar labels en tiempo real
    socket.on('admin-update-titles', (data) => {
        streamState.titleTop = data.titleTop || "";
        streamState.titleBottom = data.titleBottom || "";
        io.emit('update-titles', {
            titleTop: streamState.titleTop,
            titleBottom: streamState.titleBottom
        });
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor activo en el puerto ${PORT}`);
});