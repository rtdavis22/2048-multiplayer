function GameManager(size, InputManager, Actuator, ScoreManager) {
  this.size         = size; // Size of the grid
  this.inputManager = new InputManager;
  this.scoreManager = new ScoreManager;
  this.actuator     = new Actuator;

  this.gameId = 0;
  this.startTiles   = 2;
  this.opponentMode = false;

  //this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("move", this.requestMove.bind(this));

  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  //this.inputManager.on("placeTile", this.placeTile.bind(this));
  this.inputManager.on("placeTile", this.requestPlaceTile.bind(this));

  this.socket = io.connect('http://ec2-54-186-69-0.us-west-2.compute.amazonaws.com:8092');

  var that = this;

  this.socket.on('move', function (direction, fn) {
    fn(that.move(direction));
  });

  this.socket.on('placeTile', function() {
    that.placeTile();
  });

  this.socket.on('player1_joined', function () {
    alert('player 1 joined');
  });

  this.socket.on('player2_joined', function() {
    alert('player 2 joined');
  });

  document.getElementById("newgame").onclick = function() {
    that.newGame();
  };

  document.getElementById("player1").onclick = function() {
    that.socket.emit("player1", that.gameId, function(res) {
      if (res == 0) {
        alert('u are player 1');
      } else {
        alert('player 1 taken');
      }
    });
  };

  document.getElementById("player2").onclick = function() {
    that.socket.emit("player2", that.gameId, function(res) {
      if (res == 0) {
        alert('u are player 2');
      } else {
        alert('player 2 taken');
      }
    });
  };

  this.setup();
}

GameManager.prototype.newGame = function() {
  var that = this;

  this.socket.emit('newgame', function(gameId) {
    that.gameId = gameId;
    alert(gameId);
  });
};

// Restart the game
GameManager.prototype.restart = function () {
  this.actuator.continue();
  this.setup();
};

// Keep playing after winning
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.actuator.continue();
};

GameManager.prototype.isGameTerminated = function () {
  if (this.over || (this.won && !this.keepPlaying)) {
    return true;
  } else {
    return false;
  }
};

// Set up the game
GameManager.prototype.setup = function () {
  this.grid        = new Grid(this.size);

  this.score       = 0;
  this.over        = false;
  this.won         = false;
  this.keepPlaying = false;

  // Add the initial tiles
  //this.addStartTiles();

  this.enterOpponentMode();

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile(this.grid.randomAvailableCell(), value);

    this.grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.scoreManager.get() < this.score) {
    this.scoreManager.set(this.score);
  }

  this.actuator.actuate(this.grid, {
    score:      this.score,
    over:       this.over,
    won:        this.won,
    bestScore:  this.scoreManager.get(),
    terminated: this.isGameTerminated()
  });

};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

GameManager.prototype.placeTile = function() {
    var tile = new Tile(this.highlightedCell, 2);

    this.grid.insertTile(tile);
    //this.actuate();
    this.actuator.addTile(tile);
    this.leaveOpponentMode();
};

GameManager.prototype.requestMove = function(direction) {
    this.socket.emit('requestMove', this.gameId, direction, function(res) {

    });
};

GameManager.prototype.requestPlaceTile = function() {
  this.socket.emit('requestPlaceTile', this.gameId, function(res) {

  });
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2:down, 3: left
  var self = this;

  if (this.opponentMode) {
    x = this.highlightedCell.x;
    y = this.highlightedCell.y;

    if (direction == 0) {
      while (true) {
        y--;
        if (y < 0) {
            break;
        }
        cell = {x: x, y: y};
        if (this.grid.cellAvailable(cell)) {
          this.highlightCell({x: x, y: y});
          break;
        }
      }
    } else if (direction == 1) {
      while (true) {
        x++;
        if (x > 3) {
            break;
        }
        cell = {x: x, y: y};
        if (this.grid.cellAvailable(cell)) {
          this.highlightCell({x: x, y: y});
          break;
        }
      }
    } else if (direction == 2) {
      while (true) {
        y++;
        if (y > 3) {
          break;
        }
        cell = {x: x, y: y};
        if (this.grid.cellAvailable(cell)) {
          this.highlightCell({x: x, y: y});
          break;
        }
      }
    } else if (direction == 3) {
      while (true) {
        x--;
        if (x < 0) {
          break;
        }
        cell = {x: x, y: y};
        if (this.grid.cellAvailable(cell)) {
          this.highlightCell({x: x, y: y});
          break;
        }
      }
    }
    return false;
  }

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next      = self.grid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          // The mighty 2048 tile
          if (merged.value === 2048) self.won = true;
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  if (moved) {
    this.enterOpponentMode();

    this.actuate();
  }

  return moved;
};

GameManager.prototype.enterOpponentMode = function() {
    this.opponentMode = true;
    var firstCell = this.grid.firstAvailableCell();
    this.highlightCell(firstCell);
};

GameManager.prototype.unhighlight = function() {
    x = this.highlightedCell.x + 1
    y = this.highlightedCell.y + 1
    document.getElementById("r" + y + "c" + x).classList.remove("grid-cell-highlight");
};

GameManager.prototype.leaveOpponentMode = function() {
    this.unhighlight();
    this.opponentMode = false;
    if (!this.movesAvailable()) {
      this.over = true;
    }
    //this.actuate();
};

// Adds a tile in a random position
GameManager.prototype.addChosenTile = function () {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;

    var availableCells = this.grid.availableCells();

    var firstCell = this.grid.firstAvailableCell();
    this.highlightCell(firstCell);
    

    //var tile = new Tile(this.grid.firstAvailableCell(), value);

    this.grid.insertTile(tile);
  }
};

GameManager.prototype.highlightCell = function(cell) {
  if (this.highlightedCell) {
    this.unhighlight();
  }
  this.highlightedCell = cell;
  el = document.getElementById("r" + (cell.y + 1) + "c" + (cell.x + 1));
  //el = document.getElementById("r2c2");
  el.classList.add("grid-cell-highlight");
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // up
    1: { x: 1,  y: 0 },  // right
    2: { x: 0,  y: 1 },  // down
    3: { x: -1, y: 0 }   // left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) &&
           this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          if (other && other.value === tile.value) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};
