const io = require('socket.io')(process.env.PORT || 3001, {
    cors: {
        origin: "*",
    },
});
let rooms_data = []; //tablica przechowujące informacje o pokojach
io.on('connection', socket => { //Użytkownik się łączy z serwerem
    console.log(`Connected ${socket.id}`);
    const code = generate_code(socket.id); //wygenerowanie kodu dla gracza
    socket.emit('generate-code', code)
    socket.on('start-game', room => {
        if (!io.sockets.adapter.rooms.get(room)) {
            socket.join(room);
        }
        if (io.sockets.adapter.rooms.get(room).size < 2) {
            if (socket.id != room) {
                socket.join(room);
            }
            socket.room = room;
            if (io.sockets.adapter.rooms.get(room).size == 2) {
                io.to(room).emit('get-ready');
                rooms_data[socket.room] = {};
                rooms_data[socket.room]['players'] = [];
            };
        }
        else {
            socket.emit('you_shall_not_pass', 'Pokój jest pełny. Nastąpi przeładowanie strony');
        }
    })
    socket.on('send-board', ships => { //Przyjęcie planszy od użytkownika i sprawdzenie czy są wszystkie statki
        let ship_counter = 0;
        for (const single in ships) {
            for (const key in ships[single]) {
                ship_counter++;
            }
        }
        if (ship_counter != 21) {
            socket.emit('client_popup', "Nie rozmieściłeś wszystkich statków");
        }
        else {
            socket.emit('disable_ready_btn');
            const player_array = ships;
            rooms_data[socket.room]['players'][socket.id] = ships;
            let are_arrays_full = true;
            if (Object.keys(rooms_data[socket.room]['players']).length == 2) {
                rooms_data[socket.room]['players'].forEach(element => {
                    if (element.length != 21) {
                        are_arrays_full = false;
                    }
                })
            } else {
                are_arrays_full = false;
            }
            if (are_arrays_full) {
                io.to(socket.room).emit('lets_play_game');
                const rand = Math.floor(Math.random() * 2);
                let array = [];
                for (const player in rooms_data[socket.room]['players']) {
                    array.push(player);
                }
                const next_player = array[rand];
                rooms_data[socket.room]['turn'] = next_player;
            }
        }
    })
    socket.on('check_board', () => {//Wysłanie do użytkowników ich ostatnich plansz z serwera
        const room_data = rooms_data[socket.room]['players'];
        const user_ships = room_data[socket.id];
        socket.emit('correct_board', user_ships);
    });
    socket.on('is_my_turn', () => { //Sprawdzenie kolejności i poinformowanie użytkowników
        const next_shoter = rooms_data[socket.room]["turn"];
        let flag = false;
        if (socket.id == next_shoter) {
            flag = true;
        }
        socket.emit('change_turn', flag);
    })
    socket.on('fire_to_enemy', block => { //przyjęcie strzału od użytkownika, sprawdzenie czy trafił, wysłanie do użytkowników informacji o trafieniach, zniszczeniach
        const room_data = rooms_data[socket.room] || null;
        if (room_data)
            if (socket.id == room_data['turn']) {
                let enemy = "";
                for (const key in room_data['players']) {
                    if (key !== socket.id) {
                        enemy = key;
                        break;
                    }
                }
                let hitted = null;
                let destroyed = null;
                let obj = room_data['players'][enemy];
                for (const key in obj) {
                    const array = obj[key];
                    array.forEach(field => {
                        if (field == block) {
                            hitted = key;
                            array.splice(array.indexOf(field), 1);
                        }
                    })
                    if (hitted) {
                        if (array.length == 0) {
                            destroyed = key;
                        }
                        break
                    }
                }
                if (hitted == null) {
                    for (const player in room_data['players']) { // jeśli trafi to może dalej
                        if (rooms_data[socket.room]['turn'] != player) {
                            rooms_data[socket.room]['turn'] = player;
                            break
                        }
                    }
                    io.to(enemy).emit('change_turn', true);
                    socket.emit('change_turn', false);
                }
                socket.emit('update_enemy_board', hitted, destroyed, block);
                if (socket.room == socket.id) {
                    io.to(enemy).emit('update_user_board', hitted, destroyed, block);
                }
                else {
                    socket.broadcast.to(socket.room).emit('update_user_board', hitted, destroyed, block);
                }
                let did_player_win = true;
                for (const key in obj) {
                    if (obj[key].length != 0) {
                        did_player_win = false;
                    }
                }
                if (did_player_win) {
                    rooms_data[socket.room]['turn'] = null;
                    socket.emit('winner')
                    const my_board = room_data['players'][socket.id];
                    io.to(enemy).emit('loser', my_board);
                    delete_data(socket.room);// w razie robienie rewanżu usunąć
                }
            }
            else {
                socket.emit('client_popup', "Niestety z powodu ograniczeń serwera gra się skończyła. Musicie zacząć od nowa. Przepraszam za utrudnienia");
            }
    })
    socket.on('disconnect', () => {
        delete_data(socket.room)
    });
})
function generate_code(id) {//Wygenerowanie kodu z socket.id
    return id.slice(0, 9);
}
function delete_data(room) {//Usunięcie pokoju z tablicy pokoi po rozłączeniu się jednego z użytkowników, aby wyszyścić serwer
    if (rooms_data[room]) {
        if (rooms_data[room]['turn'] !== null) {
            io.to(room).emit('game_can_not_be_finished', 'Przeciwnik się rozłączył. Nastąpi przeładowanie strony');
        }
        io.in(room).socketsLeave(room);
        delete rooms_data[room];
    }
}