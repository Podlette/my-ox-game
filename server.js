const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 4000;

app.use(express.static(path.join(__dirname, 'public')));

// ตัวแปรเก็บข้อมูลแยกตามห้อง
let rooms = {}; 

io.on('connection', (socket) => {
    // เมื่อมีคนขอเข้าห้อง
    socket.on('joinRoom', (roomCode) => {
        socket.join(roomCode);

        // ถ้าห้องนี้ยังไม่มีอยู่ ให้สร้างห้องใหม่
        if (!rooms[roomCode]) {
            rooms[roomCode] = {
                board: Array(9).fill(null),
                history: { X: [], O: [] },
                players: {}, // เก็บ socket.id
                turns: 'X'
            };
        }

        let room = rooms[roomCode];
        let role = 'ผู้ชม';

        // จัดสรรบทบาท ผู้เล่น X และ O
        const playerIds = Object.keys(room.players);
        if (playerIds.length === 0) {
            role = 'X';
            room.players[socket.id] = 'X';
        } else if (playerIds.length === 1) {
            role = 'O';
            room.players[socket.id] = 'O';
        }

        // ส่งข้อมูลบอกผู้เล่นว่าอยู่ห้องไหน และได้บทอะไร
        socket.emit('init', { role, roomCode });
        // อัปเดตกระดานให้ทุกคนในห้องเห็นตรงกัน
        io.to(roomCode).emit('update', { board: room.board, turns: room.turns, history: room.history });

        // เมื่อมีการคลิกวางหมาก
        socket.on('move', (index) => {
            if (role !== room.turns || room.board[index] !== null) return;

            room.board[index] = role;
            room.history[role].push(index);

            // กฎตัวเก่าหายไป
            if (room.history[role].length > 3) {
                const oldestIndex = room.history[role].shift();
                room.board[oldestIndex] = null;
            }

            const winner = checkWinner(room.board);
            room.turns = room.turns === 'X' ? 'O' : 'X';

            // กระจายผลลัพธ์ให้ทุกคนในห้องนั้น
            io.to(roomCode).emit('update', { board: room.board, turns: room.turns, history: room.history, winner });
        });

        // หากมีคนกดเริ่มเกมใหม่
        socket.on('reset', () => {
            room.board = Array(9).fill(null);
            room.history = { X: [], O: [] };
            room.turns = 'X';
            io.to(roomCode).emit('update', { board: room.board, turns: room.turns, history: room.history });
        });

        // เมื่อมีคนกดปิดหน้าเว็บทิ้ง
        socket.on('disconnect', () => {
            if (room.players[socket.id]) {
                delete room.players[socket.id];
                // ถ้าห้องว่างเปล่า ให้ลบห้องทิ้งเพื่อคืนพื้นที่ให้เซิร์ฟเวอร์
                if (Object.keys(room.players).length === 0) {
                    delete rooms[roomCode];
                }
            }
        });
    });
});

function checkWinner(board) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (let line of lines) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return null;
}

server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});