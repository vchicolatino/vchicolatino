const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const WebSocket = require('ws');

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
// CONEXIÓN DIRECTA POR WEBSOCKET AL CHAT DE KICK
// ----------------------------------------------------
const KICK_CHANNEL_SLUG = "vchicolatino";

async function conectarKickChatWS() {
    try {
        console.log(`[KICK] Consultando datos de canal para: ${KICK_CHANNEL_SLUG}...`);
        
        // Obtener ID del chatroom con Headers de navegador para evitar bloqueos
        const response = await fetch(`https://kick.com/api/v1/channels/${KICK_CHANNEL_SLUG}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });
        
        const data = await response.json();
        const chatroomId = data.chatroom?.id || data.channel?.chatroom?.id;

        if (!chatroomId) {
            console.log("[KICK WARNING] No se obtuvo el Chatroom ID. Reintentando en 10s...");
            setTimeout(conectarKickChatWS, 10000);
            return;
        }

        console.log(`[KICK SUCCESS] Chatroom ID encontrado: ${chatroomId}. Conectando a WS...`);

        // Conexión al servidor WebSocket de Pusher que utiliza Kick actualmente
        const wsUrl = 'wss://ws-us2.pusher.com/app/eb1d5f283082f78b2751?protocol=7&client=js&version=7.4.0&flash=false';
        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            console.log('[KICK WS] Conexión establecida con el servidor de Kick.');
            
            // Suscribirse al canal específico del chatroom
            const subscribeMessage = JSON.stringify({
                event: 'pusher:subscribe',
                data: { auth: '', channel: `chatrooms.${chatroomId}.v2` }
            });
            ws.send(subscribeMessage);
        });

        ws.on('message', (rawMessage) => {
            try {
                const parsed = JSON.parse(rawMessage);

                // Escuchar el evento de nuevo mensaje
                if (parsed.event === 'App\\Events\\ChatMessageEvent') {
                    const eventData = typeof parsed.data === 'string' ? JSON.parse(parsed.data) : parsed.data;
                    
                    if (eventData && eventData.sender && eventData.content) {
                        const usuario = eventData.sender.username;
                        const mensaje = eventData.content;

                        console.log(`[KICK CHAT] ${usuario}: ${mensaje}`);

                        // Retransmitir a todos los clientes web en tiempo real
                        io.emit('new-chat-message', {
                            user: usuario,
                            message: mensaje
                        });
                    }
                }
            } catch (e) {
                // Ignorar pings o mensajes de control del socket
            }
        });

        ws.on('close', () => {
            console.log('[KICK WS] Conexión cerrada. Reconectando en 5 segundos...');
            setTimeout(conectarKickChatWS, 5000);
        });

        ws.on('error', (err) => {
            console.error('[KICK WS ERROR]', err.message);
            ws.close();
        });

    } catch (error) {
        console.error("[KICK ERROR]", error.message);
        setTimeout(conectarKickChatWS, 10000);
    }
}

// Iniciar escuchador de Kick
conectarKickChatWS();

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
        streamState.startOffset = time;
        if (streamState.isPlaying) {
            streamState.startTime = Date.now();
        }
        io.emit('seek-video', { time: time });
    });
	
    socket.on('resume-video', () => {
        streamState.isPlaying = true;
        streamState.startTime = Date.now();
        io.emit('resume-video', { time: streamState.startOffset });
    });

    // Actualizar labels en tiempo real
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