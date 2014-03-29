var io = require('socket.io').listen(8092);

var gameCounter = 0,
    games = {};

io.sockets.on('connection', function (socket) {
  socket.on('newgame', function(fn) {
    games[gameCounter] = {
      player1: null,
      player2: null,

      turn: 'player2',

      toggleTurn: function() {
        this.turn = (this.turn == 'player1')?'player2':'player1';
      },

      ready: function() {
        return this.player1 && this.player2;
      }
    };

    fn(gameCounter++);
  });

  socket.on('player1', function(game, fn) {
    if (games[game].player1) {
      fn(-1);
    } else {
      games[game].player1 = socket;
      fn(0);
      if (games[game].player2) {
        games[game].player2.emit('player1_joined');
      }
    }
  });

  socket.on('player2', function(game, fn) {
    if (games[game].player2) {
      fn(-1);
    } else {
      games[game].player2 = socket;
      fn(0);
      if (games[game].player1) {
        games[game].player1.emit('player2_joined');
      }
    }
  });

  socket.on('requestMove', function(game_id, direction, fn) {
    game = games[game_id];

    console.log(game.turn);

    if (!game.ready()) {
      fn(-1);
      return;
    }

    if (socket == game.player1 && game.turn != 'player1') {
      fn(-1);
      return;
    }

    if (socket == game.player2 && game.turn != 'player2') {
      fn(-1);
      return;
    }

    game.player1.emit('move', direction, function (moved) {
      console.log(moved);
      if (moved) {
        game.toggleTurn();
      }
    });

    game.player2.emit('move', direction, function () {});
  });

  socket.on('requestPlaceTile', function(game_id, fn) {
    game = games[game_id];

    if (socket == game.player2 && game.turn == 'player2') {
      game.player1.emit('placeTile');
      game.player2.emit('placeTile');
      game.toggleTurn();
      fn(0);
    }

    fn(-1);
  });
});
