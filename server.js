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
    titleTop: "BIENVENIDO GUERRERO",    // Texto del Label superior
    titleBottom: "" // Texto del Label inferior
};

// ----------------------------------------------------
// CONEXIÓN EN TIEMPO REAL AL CHAT DE KICK (vchicolatino)
// ----------------------------------------------------
const KICK_CHANNEL_SLUG = "vchicolatino";

async function iniciarConexionKickChat() {
    try {
        // 1. Obtener el ID numérico del canal desde la API pública de Kick
        const response = await fetch(`https://kick.com/api/v1/channels/${KICK_CHANNEL_SLUG}`);
        const data = await response.json();
        const chatroomData = data.chatroom || data.channel?.chatroom;

        if (!chatroomData || !chatroomData.id) {
            console.log("No se pudo obtener el Chatroom ID de Kick. Reintentando...");
            setTimeout(iniciarConexionKickChat, 10000);
            return;
        }

        const chatroomId = chatroomData.id;
        console.log(`[KICK] Conectado exitosamente al Chatroom ID: ${chatroomId}`);

        // 2. Conectar al WebSocket público de Pusher que usa Kick
        const pusher = new Pusher('32cbd69e4b950c99d79c', {
            cluster: 'us2',
            forceTLS: true
        });

        const channel = pusher.subscribe(`chatrooms.${chatroomId}.v2`);

        // 3. Escuchar cada mensaje enviado por los usuarios reales de Kick
        channel.bind('App\\Events\\ChatMessageEvent', (data) => {
            if (data && data.sender && data.content) {
                const usuario = data.sender.username;
                const mensaje = data.content;

                // Transmitir a todos los clientes web en tiempo real
                io.emit('new-chat-message', {
                    user: usuario,
                    message: mensaje
                });
            }
        });

    } catch (error) {
        console.error("[KICK ERROR] Error al conectar con el chat de Kick:", error.message);
        setTimeout(iniciarConexionKickChat, 10000);
    }
}

// Iniciar escuchador de Kick
iniciarConexionKickChat();

// ----------------------------------------------------
// MANEJO DE RUTAS Y SOCKETS WEBSOCKET
// ----------------------------------------------------
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

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