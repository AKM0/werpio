var Quadtree = require("./quadtree.js");
var express = require("express");
var socket = require("socket.io");
var socketClient = require("socket.io-client");
var fs = require("fs");

var SOCKET_ID_EV = "a";
var PINGO_EV = "b";
var PONGO_EV = "c";
var INIT_GAME_EV = "d";
var START_GAME_EV = "e";
var CLIENT_INIT_COMP_EV = "f";
var CLIENT_SHIP_NAME_EV = "g";
var GAME_CONSTANTS_EV = "h";
var SUPER_STARS_EV = "i";
var INIT_PLAYER_SHIPS_EV = "j";
var NEW_PLAYER_SHIP_EV = "k";
var UPDATE_PLAYER_SHIPS_EV = "l";
var ADD_PROJECTILE_EV = "m";
var KILL_PROJECTILE_EV = "n";
var PLAYER_DISCONNECT_EV = "p";
var THRUST_KEY_DOWN_EV = "q";
var THRUST_KEY_UP_EV = "r";
var WARP_KEY_DOWN_EV = "s";
var WARP_KEY_UP_EV = "t";
var POINTER_ANGLE_EV = "u";
var POINTER_DOWN_EV = "v";
var POINTER_UP_EV = "w";
var LEADERBOARD_UPDATE_EV = "x";
var UPDATE_CLIENT_SHIP_EV = "y";
var POWERUPS_EV = "z";
var ADD_POWERUP_EV = "0";
var KILL_POWERUP_EV = "1";
var KILL_SHIP_EV = "2";
var UPDATE_LEADER_POSITION = "3";
var GAME_DATA_INIT_COMP_EV = "4";

//SERVER CONNECTION DATA
var SERVER_LEADERBOARD_UPDATE_TICK_TIME = 1000/5;
var SERVER_CLIENT_UPDATE_TICK_TIME = 1000/30;
var SERVER_PHYSICS_TICK_TIME = 1000/60;
var NUMERICAL_DECIMAL_TRIM = 3;
var LATENCY_TIMEOUT = 500;

//GAME VARIABLES
var GAME_SIZE = 9000;
var GAME_MAX_PLAYERS = 64;
var GRAVITATIONAL_CONSTANT = 500;
var LEADERBOARD_CAPACITY = 10;
var KILLFEED_CAPACITY = 5;
var ACTIONABLE_DISTANCE = 500;

var SUPER_STARS_NUM = 28;
var SUPER_STAR_MIN_RADIUS = 18;
var SUPER_STAR_MAX_RADIUS = 36;
var SUPER_STAR_DMG = 75;
var SUPER_STAR_SPACING = 18;

var POWERUPS_NUM = 30;
var POWERUPS_SIZE = 20;
var POWERUP_SPAWN_DELAY = 3000;
var POWERUPS_FREQ_HEALTH = 0.70;
var POWERUPS_FREQ_SHIELD = 0.80;
var POWERUPS_FREQ_INVIS = 1.0;
var POWERUPS_TYPE_HEALTH = 0;
var POWERUPS_TYPE_SHIELD = 1;
var POWERUPS_TYPE_INVIS = 2;
var POWERUPS_SHIELD_DURATION = 9000;
var POWERUPS_INVIS_DURATION = 14000;
var POWERUP_SHIELD_DAMAGE_REDUCTION = 0.67;

//ships, ships of all clients/players
var GAME_SPAWN_BUFFER = 100;
var SHIP_MAX_LINEAR_VEL = 300;
var SHIP_LINEAR_ACC = 100;
var SHIP_TURN_MULTIPLIER = 6;
var SHIP_TURN_GAMMA_POW = 0.25;
var SHIP_INIT_HEALTH = 100;
var SHIP_COLLISION_DAMAGE = 50;

var SHIP_WARP_MULTIPLIER = 3;
var SHIP_WARP_INIT_BANK = 4;
var SHIP_WARP_DURATION = 3000;
var SHIP_WARP_REGEN_TIME = 24000;
var SHIP_WARP_CHARGE_DELAY = 750;
var SHIP_WARP_EXIT_SPEED_MIN = 0.2;
var SHIP_WARP_EXIT_SPEED_MAX = 0.5;
var SHIP_INIT_SHIELD_TIME = 3000;
var SHIP_INIT_MIN_VEL = 5;

var SHIP_CLIENT_UPDATE_RADIUS = 2160;

//related to weapons
var WEAPON_FIRERATE = 200;
var WEAPON_MAX_AMMO = 60; //will never use more than 15
var PROJECTILE_LIFESPAN = 1000;
var PROJECTILE_LINEAR_VEL = 1200;
var PROJECTILE_DMG = 8.5;

var MAX_SCORE = 9999999;
var SHIP_SHOT_SCORE_INC = 14;
var SHIP_KILL_SCORE_INC = 80;
var SHIP_KILL_SCORE_STEAL_PER = 0.34;
var SHIP_KILL_HEAL_PER = 0.25;
var SHIP_KILL_HEALTH_INC = 8;
var SHIP_KILL_SHIELD_TIME = 750;

//related to ai players
var AI_PLAYERS_MAX = 72;
var AI_PLAYERS_ID_BASE = "ai_player";
var AI_SHIP_TARGETING_DIST = 400;
var AI_SHIP_SHOOTING_DIST = 200;
var AI_SHIP_TOO_CLOSE_DIST = 100;
var AI_SHIP_MAX_SPEED = SHIP_MAX_LINEAR_VEL * 0.8;
var AI_SHIP_FLEE_HP = 0.3;
var AI_SHIP_WARP_TIME_MIN = 0.5;

var starTree;
var shipTree;
var projectileTree;
var powerupTree;

var superStars = [];
var clientShipsMap = new Map ();
var AIPlayerNames = [];
var AIPlayersSet = new Set();
var projectileBuffer = [];
var powerups = [];
var projectileCollisionBuffer = [];
var powerupsCollisionBuffer = [];
var leaderboardRankings = [];
var leaderScores = [];

var deltaTime;
var prevTime;

//command line options
var PORT_NUMBER = 51111;
if (process.argv.length > 2) {
  PORT_NUMBER = process.argv[2];
}

var LOG_FILE = false;
if (process.argv.length > 3) {
  LOG_FILE = true;
}

var logFileName = genLogFileName();

var app = express();
var server = app.listen(PORT_NUMBER, onServerStart);
var loadBalancerServerConnection; //connection with load balancer server

function onServerStart () {

  initCollisionTrees();
  initSuperStars();
  initPowerups();
  initAIPlayers();

  deltaTime = 0;
  prevTime = Date.now();

  loadBalancerServerConnection = socketClient.connect("http://localhost:8080"); //TODO check again
  loadBalancerServerConnection.on("connect", initLoadBalancer);
  output("GAME SERVER INITILIAZED ON PORT " + PORT_NUMBER);
}

//GAME SERVER - CLIENT code
//setup socket to listen to game clients
var io = socket(server);
io.on("connection", onSocketConnection); //when connected

function onSocketConnection(clientConnection) {

  var pingSend = Date.now();
  var latency = 16;

  output("CON " + getIP4(clientConnection) + "*" + idSub(clientConnection) + " at " + date());
  updateLoadBalancer();

  clientConnection.emit(SOCKET_ID_EV, clientConnection.id); //send socket connection id to client

  clientConnection.emit(PINGO_EV, latency);

  clientConnection.on(PONGO_EV, function(){
    latency = (Date.now() - pingSend)*0.5;
		setTimeout(function() {
	    pingSend = Date.now();
	    clientConnection.emit(PINGO_EV, latency);
		}, LATENCY_TIMEOUT); //update ping on regular intervals
  });

  clientConnection.on(INIT_GAME_EV, function() {

    emitGameConstants(clientConnection.id);
    emitSuperStars(clientConnection.id);
    emitPowerups(clientConnection.id);

    clientConnection.emit(GAME_DATA_INIT_COMP_EV);
  });

  clientConnection.on(CLIENT_SHIP_NAME_EV, function(name){
    initClientShip(clientConnection.id, name);
    emitPlayerShips(clientConnection.id);
    emitLeaderboard();
    clientConnection.emit(START_GAME_EV);
  });

  clientConnection.on(CLIENT_INIT_COMP_EV, function(){
    io.sockets.emit(NEW_PLAYER_SHIP_EV, clientShipsMap.get(clientConnection.id));
    emitLeaderboard();
  });

  clientConnection.on(THRUST_KEY_DOWN_EV, function(){
    onThrustKey(clientConnection.id, true);
  });

  clientConnection.on(THRUST_KEY_UP_EV, function(){
    onThrustKey(clientConnection.id, false);
  });

  clientConnection.on(WARP_KEY_DOWN_EV, function(){
    onWarpKey(clientConnection.id, true);
  });

  clientConnection.on(WARP_KEY_UP_EV, function(){
    onWarpKey(clientConnection.id, false);
  });

  clientConnection.on(POINTER_ANGLE_EV, function(theta) {
    onPointerMove(clientConnection.id, theta);
  });

  clientConnection.on(POINTER_DOWN_EV, function() {
    onPointer(clientConnection.id, true);
  });

  clientConnection.on(POINTER_UP_EV, function(pointer) {
    onPointer(clientConnection.id, false);
  });

  clientConnection.on("disconnect", function(){
    onDisconnect(clientConnection);
    emitLeaderboard();
  });

}

function emitGameConstants (socketId) {

  var gameConstants = new Float64Array ([
    GAME_SIZE,
    SHIP_WARP_MULTIPLIER,
    SHIP_INIT_HEALTH,
    SHIP_WARP_CHARGE_DELAY,
    WEAPON_MAX_AMMO,
    PROJECTILE_LINEAR_VEL,
    PROJECTILE_LIFESPAN,
    LEADERBOARD_CAPACITY,
    KILLFEED_CAPACITY,
    SERVER_CLIENT_UPDATE_TICK_TIME
  ]);

  io.sockets.connected[socketId].emit(GAME_CONSTANTS_EV, gameConstants);

}

function emitSuperStars (socketId) {

  var superStarsSlim = [];

  for (var i = 0; i < superStars.length; i++) {
    var superStarSlim = new Float64Array ([
      superStars[i].xPos,
      superStars[i].yPos,
      superStars[i].radius
    ]);

    superStarsSlim.push(superStarSlim);
  }

  io.sockets.connected[socketId].emit(SUPER_STARS_EV, superStarsSlim);
}

function emitPowerups(socketId) {
  var powerupsSlim = [];

  for (var i = 0; i < powerups.length; i++) {
    var powerupSlim = new Float64Array ([
      powerups[i].type,
      powerups[i].xPos,
      powerups[i].yPos
    ]);

    powerupsSlim.push(powerupSlim);
  }

  io.sockets.connected[socketId].emit(POWERUPS_EV, powerupsSlim);

}

function emitPlayerShips(socketId) {

  var playerShipsSlim = [];
  var playerShips = Array.from(clientShipsMap.values());

  for (var i = 0; i < playerShips.length; i++) {

    var playerShip = playerShips[i];

    var playerShipSlim = { //TODO convert to float 64 later

      socketId: playerShips[i].socketId,
      shipId: playerShips[i].shipId,
      shipName: playerShips[i].shipName,
      shipType: playerShips[i].shipType,
      shipColor: playerShips[i].shipColor,
      shipScore: playerShips[i].shipScore,

      xPos: playerShips[i].xPos,
      yPos: playerShips[i].yPos,
      xVel: playerShips[i].xVel,
      yVel: playerShips[i].yVel,
      rotation: playerShips[i].rotation,

      shipHealth: playerShips[i].shipHealthPer,
      shipAlive: playerShips[i].shipAlive,

      shipWarpBankSize: playerShips[i].shipWarpBankSize,
      shipWarpsRemaining: playerShips[i].shipWarpsRemaining,
      shipAccelerating: playerShips[i].shipAccelerating,
      shipInWarp: playerShips[i].shipInWarp,
      shipShielded: playerShips[i].shipShielded,
      shipInvisible: playerShips[i].shipInvisible

    }

    playerShipsSlim.push(playerShipSlim);

  }

  io.sockets.connected[socketId].emit(INIT_PLAYER_SHIPS_EV, playerShipsSlim);

}

function emitLeaderboard () {

  //create a slim leaderboard to emit to client
  var leaderboardSlim = new Float64Array (2 * leaderboardRankings.length);

  for (var i = 0; i < leaderboardRankings.length; i++) {
    if (clientShipsMap.has(leaderboardRankings[i])) {
      var ship = clientShipsMap.get(leaderboardRankings[i]);
      leaderboardSlim[2*i] = ship.shipId;
      leaderboardSlim[(2*i) + 1] = ship.shipScore;
    }
  }

  io.sockets.emit(LEADERBOARD_UPDATE_EV, leaderboardSlim);
}

//SERVER EVENTS
function onThrustKey(id, pressed) { //called when state of thrust key changes

  if (clientShipsMap.has(id)) {
    var clientShip = clientShipsMap.get(id);
    if (clientShip.shipAlive) {
      if (pressed && (!clientShip.thrustPressed)) { //if starting to thrust
        clientShip.thrustPressed = true;
      } else if ((!pressed) && clientShip.thrustPressed) { //exiting thrust
        clientShip.thrustPressed = false;
      }
    }
  }
}

function onWarpKey(id, pressed) { //called when state of warp key changes

  if (clientShipsMap.has(id)) {
    var clientShip = clientShipsMap.get(id);

    if (clientShip.shipAlive) {
      if (pressed && (!clientShip.warpPressed)) { //if warp key is down

        clientShip.lastWarpPress = Date.now();
        clientShip.warpPressDuration = 0;
        clientShip.warpPressed = true;

      } else if ((!pressed) && clientShip.warpPressed) { //warp key is up

        clientShip.lastWarpPress = 0;
        clientShip.warpPressDuration = 0;
        clientShip.warpPressed = false;

        if (clientShip.shipInWarp) {
          updateShipWarpExit(clientShip);
        }

      }
    }
  }

}

function onPointer(id, down) { //called when user clicks

  if (clientShipsMap.has(id)) {
    var clientShip = clientShipsMap.get(id);

    if (clientShip.shipAlive) {
      if (down && (!clientShip.clickPressed)) { //if click occured
        clientShip.clickPressed = true;
      } else if ((!down) && clientShip.clickPressed) { //exiting click
        clientShip.clickPressed = false;
      }
    }
  }
}

function onPointerMove(id, theta) { //called when user moves mouse

  if (clientShipsMap.has(id)) {
    var clientShip = clientShipsMap.get(id);

    if (clientShip.shipAlive) {
      if (!clientShip.shipInWarp) {
        clientShip.rotation = theta;
      }
    }
  }

}

function onDisconnect(clientConnection) {
  if (clientShipsMap.has(clientConnection.id)) {
    var playerShip = clientShipsMap.get(clientConnection.id);
    clientShipsMap.delete(clientConnection.id);
    io.sockets.emit(PLAYER_DISCONNECT_EV, playerShip.shipId);
  }

  output("DIS " + getIP4(clientConnection) + "*" + idSub(clientConnection)+ " at " + date());
  updateLoadBalancer();
}

//GAME METHODS
function initCollisionTrees () {

  starTree = new Quadtree({
    x: 0,
    y: 0,
    width: GAME_SIZE,
    height: GAME_SIZE
  }, 5);

  shipTree = new Quadtree({
    x: 0,
    y: 0,
    width: GAME_SIZE,
    height: GAME_SIZE
  }, 5);

  projectileTree = new Quadtree({
    x: 0,
    y: 0,
    width: GAME_SIZE,
    height: GAME_SIZE
  }, 10);

  powerupTree = new Quadtree({
    x: 0,
    y: 0,
    width: GAME_SIZE,
    height: GAME_SIZE
  }, 5);

}

function initSuperStars() {
  for (var i = 0; i < SUPER_STARS_NUM; i++) {

    var x = integerInRange((SUPER_STAR_MAX_RADIUS*SUPER_STAR_SPACING), GAME_SIZE - (SUPER_STAR_MAX_RADIUS*SUPER_STAR_SPACING)); //x position
    var y = integerInRange((SUPER_STAR_MAX_RADIUS*SUPER_STAR_SPACING), GAME_SIZE - (SUPER_STAR_MAX_RADIUS*SUPER_STAR_SPACING)); //y position
    var rad = integerInRange(SUPER_STAR_MIN_RADIUS, SUPER_STAR_MAX_RADIUS); //radius

    //check stars do not collide
    var safeSpawn = true;

		var canidates = starTree.retrieve({
			x: (x - rad),
			y: (y - rad),
			width: (rad*2),
			height: (rad*2)
		});

		for (var j = 0; j < canidates.length; j++) {

			var canidateStar = superStars[canidates[j].num];

			var x2 = canidateStar.xPos;
			var y2 = canidateStar.yPos;
			var rad2 = canidateStar.radius;
			if (mag(x - x2, y - y2) <= ((rad + rad2) * SUPER_STAR_SPACING)) {
				safeSpawn = false;
				break;
			}

		}

    if (safeSpawn) {

      var superStar = {
        xPos: x,
        yPos: y,
        radius: rad
      };
      superStars.push(superStar);

      starTree.insert({
        num: i,
        x: (superStar.xPos - superStar.radius),
        y: (superStar.yPos - superStar.radius),
        width: (superStar.radius*2),
        height: (superStar.radius*2)
      });

    } else {
      i = i - 1;
    }

  }
}

function initPowerups() {
  for (var k = 0; k < POWERUPS_NUM; k++) {
    initPowerup();
  }
}

function initAIPlayers(){
  readAINames();
  for (var i = 0; i < AI_PLAYERS_MAX; i++) {
    AIPlayersSet.add(AI_PLAYERS_ID_BASE + i);
    initClientShip(AI_PLAYERS_ID_BASE + i, getAIPlayerName());
  }
}

function readAINames() {
  AIPlayerNames = fs.readFileSync("names.txt").toString().replace(/\r\n/g,'\n').split('\n');
}

function initPowerup() {

  var x;
  var y;
  var type;
  var num = Math.random();

  if ((num >= 0) && (num < POWERUPS_FREQ_HEALTH)) {
    type = POWERUPS_TYPE_HEALTH;
  } else if ((num >= POWERUPS_FREQ_HEALTH) && (num < POWERUPS_FREQ_SHIELD)) {
    type = POWERUPS_TYPE_SHIELD;
  } else if ((num >= POWERUPS_FREQ_SHIELD) && (num < POWERUPS_FREQ_INVIS)) {
    type = POWERUPS_TYPE_INVIS;
  }

  var safeSpawn = false;

  //ensures that the spawn for this powerup doesn't collide with a star
  while (!safeSpawn) {

    if (!safeSpawn) {
      x = integerInRange(GAME_SPAWN_BUFFER, GAME_SIZE-GAME_SPAWN_BUFFER);
      y = integerInRange(GAME_SPAWN_BUFFER, GAME_SIZE-GAME_SPAWN_BUFFER);
    } else {
      break;
    }

    safeSpawn = true;

    var canidates = starTree.retrieve({
        x: (x - POWERUPS_SIZE*0.5),
        y: (y - POWERUPS_SIZE*0.5),
        width: POWERUPS_SIZE,
        height: POWERUPS_SIZE
      });

    if (safeSpawn) {
      for (var i = 0; i < canidates.length; i++) {

        var superStar = superStars[canidates[i].num];
        if (mag(superStar.xPos - x, superStar.yPos - y) < (superStar.radius*SUPER_STAR_SPACING)) {
          safeSpawn = false;
          break;
        }

      }
    }

  }

  powerupTree.insert({
    type: type,
    num: (powerups.length - 1),
    x: (x - POWERUPS_SIZE*0.5),
    y: (y - POWERUPS_SIZE*0.5),
    width: POWERUPS_SIZE,
    height: POWERUPS_SIZE
  });

  var powerup = {
    type: type,
    xPos: x,
    yPos: y
  }

  powerups.push(powerup);

}

function initClientShip(socketId, name) {

  var type = integerInRange(0, 3); //4 ship types
  var color = integerInRange(0, 8); //9 color types
  name = verifyShipName(name);

	var x;
  var y;
	var dims = getShipDims(type);

  var initVelX = integerInRange(-SHIP_INIT_MIN_VEL, SHIP_INIT_MIN_VEL);
  var initVelY = integerInRange(-SHIP_INIT_MIN_VEL, SHIP_INIT_MIN_VEL);

  var initRotation = integerInRange(0, Math.PI * 2);

	var safeSpawn = false;

	//ensures that the spawn for this ship is not bad
	while (!safeSpawn) {

		if (!safeSpawn) {
			x = integerInRange(GAME_SPAWN_BUFFER, GAME_SIZE-GAME_SPAWN_BUFFER);
			y = integerInRange(GAME_SPAWN_BUFFER, GAME_SIZE-GAME_SPAWN_BUFFER);
		} else {
			break;
		}

		safeSpawn = true;

    var canidates = starTree.retrieve({
				x: (x - dims.x*0.5),
				y: (y - dims.y*0.5),
				width: dims.x,
				height: dims.y
			});

    if (safeSpawn) {
  		for (var i = 0; i < canidates.length; i++) {

    		var superStar = superStars[canidates[i].num];
    		if (mag(superStar.xPos - x, superStar.yPos - y) < (superStar.radius*SUPER_STAR_SPACING)) {
    			safeSpawn = false;
    			break;
    		}

      }
    }

    var canidates = shipTree.retrieve({
      x: (x - dims.x*0.5),
      y: (y - dims.y*0.5),
      width: dims.x,
      height: dims.y
    });

    if (safeSpawn) {
      for (var j = 0; j < canidates.length; j++) {

        if (clientShipsMap.has(canidates[j].id)) {
          var playerShip = clientShipsMap.get(canidates[j].id);
          if (mag(playerShip.xPos - x, playerShip.yPos - y) < dims.y) {
            safeSpawn = false;
            break;
          }
        }

      }
    }

	}

  var clientShip = {

    //ship identification
    socketId: socketId,
    shipId: genID(),
    shipName: name,
    shipType: type,
    shipColor: color,

    //ship info
    shipScore: 0,

    //input
    thrustPressed: false,

    lastWarpPress: 0,
    warpPressDuration: 0,
    warpPressed: false,

    lastClick: 0,
    clickPressed: false,
    clickEnabled: true,

    //ship physics
    xPos: x,
    yPos: y,
    xVel: initVelX,
    yVel: initVelY,
    xAcc: 0,
    yAcc: 0,
    forcesX: 0,
    forcesY: 0,
    shipGamma: 0,
    rotation: initRotation,

    //ship states
    shipHealth: SHIP_INIT_HEALTH,
    shipHealthMax: SHIP_INIT_HEALTH,
    shipHealthPer: SHIP_INIT_HEALTH/SHIP_INIT_HEALTH,
    shipAlive: true,
    shipWarpBankSize: SHIP_WARP_INIT_BANK,
    shipWarpsRemaining: SHIP_WARP_INIT_BANK,
    shipChangingDirection: false,
    shipAccelerating: false,
    shipInWarp: false,
    shipShielded: true,
    shipShieldedTime: SHIP_INIT_SHIELD_TIME,
    shipInvisible: false,
    shipInvisibleTime: 0
  };

  var dims = getShipDims(clientShip.shipType);

  shipTree.insert({
    id: clientShip.socketId,
    x: (clientShip.xPos - dims.x*0.5),
    y: (clientShip.yPos - dims.y*0.5),
    width: dims.x,
    height: dims.y
  });

  clientShipsMap.set(socketId, clientShip);

}

function updateShipWeapon(clientShip) {

  if (clientShip.shipAlive) {
    if (clientShip.clickPressed && clientShip.clickEnabled && (!clientShip.shipInWarp)) {

      var dims = getShipDims(clientShip.shipType);

      var r = mag(dims.x*0.5, dims.y*0.5);
      var offX = r*Math.cos(clientShip.rotation);
      var offY = r*Math.sin(clientShip.rotation);


      var id = clientShip.shipId;
  		var projID = genID();
      var oX = (clientShip.xPos + offX);
      var oY = (clientShip.yPos + offY);
      var theta = clientShip.rotation;

      var projectile = new Float64Array ([
        id,
        projID,
        oX,
        oY,
        theta
      ]);

      clientShip.clickEnabled = false; //sets packet flood limitation

      setTimeout(function(){
        clientShip.clickEnabled = true;
      }, WEAPON_FIRERATE);

  		projectileBuffer.push({
  			id: clientShip.socketId,
  			projID: projID,
  			age: PROJECTILE_LIFESPAN,
  			x: oX,
  			y: oY,
  			theta: theta
  		});

  		projectileTree.insert({
  			num: (projectileBuffer.length - 1),
  			x: oX,
  			y: oY,
  			width: 1,
  			height: 1
  		});

      io.sockets.emit(ADD_PROJECTILE_EV, projectile);
    }
  }
}

function updateAIPlayers(){
  var AIShips = Array.from(AIPlayersSet);
  for (var i = 0; i < AIShips.length; i++) {
    if (clientShipsMap.has(AIShips[i])) {
      updateAIPlayer(clientShipsMap.get(AIShips[i]));
    } else {
      respawnAIPlayer(AIShips[i]);
    }
  }
}

function respawnAIPlayer(AIShipId) {
  if (clientShipsMap.size < GAME_MAX_PLAYERS) {
      initClientShip(AIShipId, getAIPlayerName());
      io.sockets.emit(NEW_PLAYER_SHIP_EV, clientShipsMap.get(AIShipId));
      emitLeaderboard();
    }
}

function updateAIPlayer(AIShip) {
  updateAIToTarget(AIShip, findAITargetShip(AIShip));
}

function findAITargetShip(AIShip) { //return the closest ship to the AI

  var canidates = shipTree.retrieve({
    x: (AIShip.xPos - AI_SHIP_TARGETING_DIST),
    y: (AIShip.yPos - AI_SHIP_TARGETING_DIST),
    width: (AI_SHIP_TARGETING_DIST*2),
    height: (AI_SHIP_TARGETING_DIST*2)
  });

  var closestShips = [];
  for (var i = 0; i < canidates.length; i++) {
    if ((clientShipsMap.has(canidates[i].id)) && (canidates[i].id != AIShip.socketId)) {
      var playerShip = clientShipsMap.get(canidates[i].id);
      if (!playerShip.shipInvisible) {
        var dist = mag(playerShip.xPos - AIShip.xPos, playerShip.yPos - AIShip.yPos);
        closestShips.push({
          ship: playerShip,
          distance: dist
        });
      }
    }
  }

  if (closestShips.length == 0) {
    return null;
  }

  closestShips.sort(function(a, b) {
    return (a.distance -  b.distance);
  });

  return closestShips[0].ship;

}

function updateAIToTarget(AIShip, AIShipTarget) {
  if (AIShipTarget != null) {
    var theta = angleBetween(AIShip.xPos, AIShip.yPos, AIShipTarget.xPos, AIShipTarget.yPos);
    var dist = mag(AIShipTarget.xPos - AIShip.xPos, AIShipTarget.yPos - AIShip.yPos);
    updateAIRotation(AIShip, theta, dist);
    updateAIMovement(AIShip, theta, dist);
    updateAIShooting(AIShip, theta, dist);
  }
}

function updateAIRotation(AIShip, theta, dist) {
  if (AIShip.shipHealthPer < AI_SHIP_FLEE_HP || dist < AI_SHIP_TOO_CLOSE_DIST) {
    onPointerMove(AIShip.socketId, theta + Math.PI); //turn ship completely around if too weak
  } else {
    onPointerMove(AIShip.socketId, theta); //try to target
  }
}

function updateAIMovement(AIShip, theta, dist) {
  if (AIShip.shipHealthPer < AI_SHIP_FLEE_HP) {
    onThrustKey(AIShip.socketId, false);
    onWarpKey(AIShip.socketId, true);
    setTimeout(function(){ //stop warp after some time
      onWarpKey(AIShip.socketId, false);
    }, (SHIP_WARP_DURATION + SHIP_WARP_CHARGE_DELAY) * AI_SHIP_WARP_TIME_MIN);
  } else { //either thrust or stop thrusting depending on ship speed
    if (mag(AIShip.xVel, AIShip.yVel) < AI_SHIP_MAX_SPEED && dist > AI_SHIP_SHOOTING_DIST) {
      onThrustKey(AIShip.socketId, true);
    } else {
      onThrustKey(AIShip.socketId, false);
    }
  }
}

function updateAIShooting(AIShip, theta, dist) {
  if (AIShip.shipHealthPer >= AI_SHIP_FLEE_HP && (AIShip.rotation == theta)) {
    if (dist < AI_SHIP_TARGETING_DIST) {
      onPointer(AIShip.socketId, true);
    } else {
      onPointer(AIShip.socketId, false);
    }
  }
}

function updateShipStates() {
  var clientShips = Array.from(clientShipsMap.values());
  for (var i = 0; i < clientShips.length; i++) {
    updateShipState(clientShips[i]);
  }
}

function updateShipState(clientShip) {

  if (clientShip.shipAlive) {

    var thr = clientShip.thrustPressed;
    var warp = clientShip.warpPressed;

    //update states by input
    if (thr && warp) { //both warp and thrust down

      if (clientShip.shipInWarp) { //if ship was in warp when both down
        updateShipWarpExit(clientShip);
      }

      clientShip.lastWarpPress = Date.now();
      clientShip.warpPressDuration = 0;

      clientShip.shipAccelerating = false;
      clientShip.shipInWarp = false;

    } else if (thr && !warp) { //only thrust down
      clientShip.shipAccelerating = true;
      clientShip.shipInWarp = false;
      clientShip.lastWarpPress = Date.now();
      clientShip.warpPressDuration = 0;
    } else if (!thr && warp) { //only warp key down

      clientShip.warpPressDuration = Date.now() - clientShip.lastWarpPress;

      if ((clientShip.warpPressDuration > SHIP_WARP_CHARGE_DELAY) && (clientShip.shipWarpsRemaining > 0)) {

        if (!clientShip.shipInWarp) {
          setTimeout(function(){
            clientShip.shipWarpsRemaining = clientShip.shipWarpsRemaining + 1;
          }, SHIP_WARP_REGEN_TIME);
          clientShip.shipInWarp = true;
          clientShip.shipWarpsRemaining = clientShip.shipWarpsRemaining - 1;
          clientShip.shipAccelerating = false;
        }
      }

      if (clientShip.warpPressDuration > (SHIP_WARP_DURATION + SHIP_WARP_CHARGE_DELAY)) {
        updateShipWarpExit(clientShip);
      }

    } else {
      clientShip.shipAccelerating = false;
      clientShip.shipInWarp = false;
    }

    //update other ship states such as powerups
    if (clientShip.shipShielded) {

      if (clientShip.shipShieldedTime > 0) {
        clientShip.shipShieldedTime = clientShip.shipShieldedTime - (deltaTime*1000);
      } else {
        clientShip.shipShieldedTime = 0;
        clientShip.shipShielded = false;
      }
    }

    if (clientShip.shipInvisible) {

      if (clientShip.shipInvisibleTime > 0) {
        clientShip.shipInvisibleTime = clientShip.shipInvisibleTime - (deltaTime*1000);
      } else {
        clientShip.shipInvisibleTime = 0;
        clientShip.shipInvisible = false;
      }
    }

  }

}

function updateWeapons () {
  var clientShips = Array.from(clientShipsMap.values());

  for (var i = 0; i < clientShips.length; i++) {
    updateShipWeapon(clientShips[i]);
  }
}

function updatePhysics() {
  updateDeltaTime();

  var clientShips = Array.from(clientShipsMap.values());

  for (var i = 0; i < clientShips.length; i++) {
    updatePhysicsShip(clientShips[i]);
  }

	for (var j = (projectileBuffer.length - 1); j >= 0; j--) {
		updatePhysicsProjectile(projectileBuffer[j], j);
	}

}

function updateDeltaTime() {
  deltaTime = (Date.now() - prevTime) * 0.001;
  prevTime = Date.now();
}

function updatePhysicsShip(clientShip) {

  if (clientShip.shipAlive) {
    if (!clientShip.shipInWarp) {
      updatePhysicsShipNorm(clientShip);
      updatePhysicsAttraction(clientShip);
    } else if (clientShip.shipInWarp) {
      updatePhysicsShipWarp(clientShip);
    } else {
      output("Error in updatePhysicsShip");
    }
  }
}

function updatePhysicsShipNorm(clientShip) {

  clientShip.shipGamma = Math.abs(1.0 - Math.pow((mag(clientShip.xVel, clientShip.yVel)/SHIP_MAX_LINEAR_VEL), 2.0));

  //update acceleration
  if (clientShip.shipAccelerating) { //thrust key is down for client

    //update velocity
    clientShip.xAcc = SHIP_LINEAR_ACC*Math.cos(clientShip.rotation);
    clientShip.yAcc = SHIP_LINEAR_ACC*Math.sin(clientShip.rotation);

    //determine if ship is changing direction
    var oldVel = mag(clientShip.xVel, clientShip.yVel);
    var newVel = mag(clientShip.xVel + clientShip.xAcc, clientShip.yVel + clientShip.yAcc);

    clientShip.shipChangingDirection = (newVel < oldVel); //determine if ship is changing direction

    if (clientShip.shipChangingDirection) { //if ship is changing directions make acceleration more reactive
      clientShip.shipGamma = Math.pow(clientShip.shipGamma, SHIP_TURN_GAMMA_POW) * SHIP_TURN_MULTIPLIER;
    }

  } else {

    clientShip.shipChangingDirection = false;
    clientShip.xAcc = 0;
    clientShip.yAcc = 0;

  }

  clientShip.xVel = clientShip.xVel + clientShip.xAcc*clientShip.shipGamma*deltaTime; //update velocity
  clientShip.yVel = clientShip.yVel + clientShip.yAcc*clientShip.shipGamma*deltaTime;

  clientShip.xPos = clientShip.xPos + clientShip.xVel*deltaTime; //update positions
  clientShip.yPos = clientShip.yPos + clientShip.yVel*deltaTime;

  //update ship gamma to pre-reactive state
  clientShip.shipGamma = Math.abs(1.0 - Math.pow((mag(clientShip.xVel, clientShip.yVel)/SHIP_MAX_LINEAR_VEL), 2.0));

}

function updatePhysicsShipWarp(clientShip) {

  clientShip.shipGamma = 0;
  clientShip.shipChangingDirection = false;

  clientShip.xAcc = 0; //update acceleration
  clientShip.yAcc = 0;

  clientShip.xVel = SHIP_MAX_LINEAR_VEL*SHIP_WARP_MULTIPLIER*Math.cos(clientShip.rotation); //update velocity
  clientShip.yVel = SHIP_MAX_LINEAR_VEL*SHIP_WARP_MULTIPLIER*Math.sin(clientShip.rotation);

  clientShip.xPos = clientShip.xPos + clientShip.xVel*deltaTime; //update position
  clientShip.yPos = clientShip.yPos + clientShip.yVel*deltaTime;

}

function updatePhysicsAttraction (clientShip) {

  clientShip.forcesX = 0;
  clientShip.forcesY = 0;

  for (var i = 0; i < superStars.length; i++) { //for all super stars

    var dist = mag(superStars[i].xPos - clientShip.xPos, superStars[i].yPos - clientShip.yPos);

    if ((dist < (ACTIONABLE_DISTANCE+superStars[i].radius)) && (dist > superStars[i].radius)) {
      var distSq = Math.pow(dist, 2.0);
      var mass = Math.pow(superStars[i].radius*0.5, 2);
      var phi = angleBetween(clientShip.xPos, clientShip.yPos, superStars[i].xPos, superStars[i].yPos);

      clientShip.forcesX += (GRAVITATIONAL_CONSTANT * mass/distSq) * Math.cos(phi);
      clientShip.forcesY += (GRAVITATIONAL_CONSTANT * mass/distSq) * Math.sin(phi);
    }

  }

  clientShip.xVel += clientShip.forcesX * clientShip.shipGamma; //alter velocity of ship
  clientShip.yVel += clientShip.forcesY * clientShip.shipGamma;

  clientShip.xPos = clientShip.xPos + clientShip.xVel*deltaTime; //update position
  clientShip.yPos = clientShip.yPos + clientShip.yVel*deltaTime;

}

function updateShipWarpExit(clientShip) {

  var maxSpeed = Math.pow(SHIP_MAX_LINEAR_VEL, 2); //find max ship speed
  var speed = Math.pow(integerInRange(maxSpeed*SHIP_WARP_EXIT_SPEED_MIN, maxSpeed*SHIP_WARP_EXIT_SPEED_MAX), 0.5);
  var phi = Math.atan2(clientShip.yVel, clientShip.xVel);

  clientShip.xAcc = 0;
  clientShip.yAcc = 0;

  clientShip.xVel = speed*Math.cos(phi);
  clientShip.yVel = speed*Math.sin(phi);

  clientShip.xPos = clientShip.xPos + clientShip.xVel*deltaTime; //update position
  clientShip.yPos = clientShip.yPos + clientShip.yVel*deltaTime;

  clientShip.shipGamma = Math.abs(1.0 - Math.pow((mag(clientShip.xVel, clientShip.yVel)/SHIP_MAX_LINEAR_VEL), 2.0));

  clientShip.shipChangingDirection = false;

  clientShip.shipAccelerating = false;
  clientShip.shipInWarp = false;

  clientShip.lastWarpPress = Date.now();
  clientShip.warpPressDuration = 0;

}

function updatePhysicsProjectile(projectile, index) {

	projectile.age = projectile.age - (deltaTime*1000);

	if (projectile.age > 0) {

		projectile.x = projectile.x + PROJECTILE_LINEAR_VEL*Math.cos(projectile.theta)*deltaTime;
		projectile.y = projectile.y + PROJECTILE_LINEAR_VEL*Math.sin(projectile.theta)*deltaTime;

	} else {
		projectileBuffer.splice(index, 1);
	}
}

function updatePowerupCollisions () {

  var cull = [];

  for (var i = 0; i < powerupsCollisionBuffer.length; i++) {

    var collision = powerupsCollisionBuffer[i];
    var clientShip = collision.ship;
    var powerup = collision.powerup;
    applyPowerup(clientShip, powerup);
    cull.push(powerups.indexOf(powerup));

  }

  if (cull.length > 0) {

    cull.sort().reverse();
    for (var j = (cull.length - 1); j >= 0; j--) {
      killPowerup(powerups[cull[j]]);
      powerups.splice(cull[j], 1);
    }

    var numToSpawn = (POWERUPS_NUM - powerups.length);

    for (var k = 0; k < numToSpawn; k++) {
      setTimeout(function(){
        initPowerup();
        addPowerup(powerups[powerups.length - 1]);
      }, POWERUP_SPAWN_DELAY);
    }
  }

  powerupsCollisionBuffer = [];

}

function applyPowerup(clientShip, powerup) {
  if (powerup.type == POWERUPS_TYPE_HEALTH) {
    clientShip.shipHealth = clientShip.shipHealthMax;
    clientShip.shipHealthPer = (clientShip.shipHealth/clientShip.shipHealthMax);
  } else if (powerup.type == POWERUPS_TYPE_SHIELD) {
    clientShip.shipShielded = true;
    clientShip.shipShieldedTime = POWERUPS_SHIELD_DURATION;
  } else if (powerup.type == POWERUPS_TYPE_INVIS) {
    clientShip.shipInvisible = true;
    clientShip.shipInvisibleTime = POWERUPS_INVIS_DURATION;
  }
}

function updateCollisionTrees () {

  shipTree.clear();
  projectileTree.clear();
  powerupTree.clear();

  //update tree with all client ships
  var clientShips = Array.from(clientShipsMap.values());
  for (var j = 0; j < clientShips.length; j++) {

    if (clientShips[j].shipAlive) {
      var dims = getShipDims(clientShips[j].shipType);

      shipTree.insert({
        id: clientShips[j].socketId,
        x: (clientShips[j].xPos - dims.x*0.5),
        y: (clientShips[j].yPos - dims.y*0.5),
        width: dims.x,
        height: dims.y
      });
    }

  }

	//update tree with projectiles
	for (var k = 0; k < projectileBuffer.length; k++) {

		projectileTree.insert({
			num: k,
			id: projectileBuffer[k].id,
			x: projectileBuffer[k].x,
			y: projectileBuffer[k].y,
			width: 1,
			height: 1
		});

	}

  for (var m = 0; m < powerups.length; m++) {

    powerupTree.insert({
      type: powerups[m].type,
      num: m,
      x: (powerups[m].xPos - POWERUPS_SIZE*0.5),
      y: (powerups[m].yPos - POWERUPS_SIZE*0.5),
      width: POWERUPS_SIZE,
      height: POWERUPS_SIZE
    });

  }

}

function updateShipCollisions() {

  var clientShips = Array.from(clientShipsMap.values());

  for (var i = 0; i < clientShips.length; i++) {
    updateShipCollision(clientShips[i]);
  }
}

function updateShipCollision(clientShip) {
  if (clientShip.shipAlive) {
    updateShipWorldBounds(clientShip);
    updateShipObjectCollision(clientShip);
  }
}

function updateShipWorldBounds(clientShip) {

  var dims = getShipDims(clientShip.shipType);

  //left and right world bounds
  if ((clientShip.xPos + dims.x*0.5) > GAME_SIZE) {
    clientShip.xPos = (GAME_SIZE - dims.x*0.5);
    clientShip.xVel = 0;
  } else if ((clientShip.xPos - dims.x*0.5) < 0) {
    clientShip.xPos = (0 + dims.x*0.5);
    clientShip.xVel = 0;
  }

  //top and bottom world bounds
  if ((clientShip.yPos + dims.y*0.5) > GAME_SIZE) {
    clientShip.yPos = (GAME_SIZE - dims.y*0.5);
    clientShip.yVel = 0;
  } else if ((clientShip.yPos - dims.y*0.5) < 0) {
    clientShip.yPos = (0 + dims.y*0.5);
    clientShip.yVel = 0;
  }

}

function updateShipObjectCollision(clientShip) {

  var dims = getShipDims(clientShip.shipType);

  var canidates = starTree.retrieve({
    x: (clientShip.xPos - dims.x*0.5),
    y: (clientShip.yPos - dims.y*0.5),
    width: dims.x,
    height: dims.y
  });

  for (var i = 0; i < canidates.length; i++) {
    var superStar = superStars[canidates[i].num];
    if (mag(superStar.xPos - clientShip.xPos, superStar.yPos - clientShip.yPos) < (superStar.radius + dims.x*0.5)) {
      damageShipContinous(clientShip, SUPER_STAR_DMG);

      if (clientShip.shipHealth <= 0) {
        killShip(clientShip, -1);
      }

    }
  }

  var canidates = shipTree.retrieve({
    x: (clientShip.xPos - dims.x*0.5),
    y: (clientShip.yPos - dims.y*0.5),
    width: dims.x,
    height: dims.y
  });

  for (var j = 0; j < canidates.length; j++) {
    if (clientShipsMap.has(canidates[j].id)) {
      var playerShip = clientShipsMap.get(canidates[j].id);
      if ((playerShip.socketId != clientShip.socketId) && mag(playerShip.xPos - clientShip.xPos, playerShip.yPos - clientShip.yPos) < dims.x) {
        damageShipContinous(clientShip, SHIP_COLLISION_DAMAGE);

        if (clientShip.shipHealth <= 0) {
          killShip(clientShip, playerShip);
          changeScore(playerShip, SHIP_KILL_SCORE_INC);
        }

      }
    }
  }

  var canidates = projectileTree.retrieve({
    x: (clientShip.xPos - dims.x*0.5),
    y: (clientShip.yPos - dims.y*0.5),
    width: dims.x,
    height: dims.y
  });

  for (var k = 0; k < canidates.length; k++) {
    var projectile = projectileBuffer[canidates[k].num];
    if (AABB(clientShip.xPos - dims.x*0.5, clientShip.yPos - dims.y*0.5, dims.x, dims.y, projectile.x, projectile.y, 1, 1)) {
      projectile.age = -PROJECTILE_LIFESPAN; //effectively kill projectile
      projectileCollisionBuffer.push({
        shipHit: clientShip,
        projectile: projectile
      });
    }
  }

  var canidates = powerupTree.retrieve({
    x: (clientShip.xPos - dims.x*0.5),
    y: (clientShip.yPos - dims.y*0.5),
    width: dims.x,
    height: dims.y
  });

  for (var m = 0; m < canidates.length; m++) {
    var powerup = powerups[canidates[m].num];
    if (mag(powerup.xPos - clientShip.xPos, powerup.yPos - clientShip.yPos) < POWERUPS_SIZE) {
      powerupsCollisionBuffer.push({
        ship: clientShip,
        powerup: powerup
      });
    }
  }

}

function updateProjectileCollisions() {

  //manage all collisions which occur
  for (var i = 0; i < projectileCollisionBuffer.length; i++) {
    var collision = projectileCollisionBuffer[i];

    var shipHit = collision.shipHit;

    killProjectile(collision.projectile);
    damageShipDiscreet(shipHit, PROJECTILE_DMG);

    if (clientShipsMap.has(collision.projectile.id)) {
      var shipShoot = clientShipsMap.get(collision.projectile.id);
      changeScore(shipShoot, SHIP_SHOT_SCORE_INC);

      if (shipHit.shipHealth <= 0) {
        killShip(shipHit, shipShoot);
        changeScore(shipShoot, SHIP_KILL_SCORE_INC);
      }
    }
  }

  projectileCollisionBuffer = [];

	//handle collisions between super stars and projectiles
	for (var i = 0; i < superStars.length; i++) {

		var canidates = projectileTree.retrieve({
			x: (superStars[i].xPos - superStars[i].radius),
			y: (superStars[i].yPos - superStars[i].radius),
			width: (superStars[i].radius*2),
			height: (superStars[i].radius*2)
		});

		for (var j = 0; j < canidates.length; j++) {

			var projectile = canidates[j];
			if (mag(projectile.x - superStars[i].xPos, projectile.y - superStars[i].yPos) < superStars[i].radius) {
				projectileBuffer[projectile.num].age = -PROJECTILE_LIFESPAN;
        killProjectile(projectileBuffer[projectile.num]);
			}

		}

	}
}

function updateClientsWithServer() {

	var clientShips = Array.from(clientShipsMap.values());

	for (var i = 0; i < clientShips.length; i++) {
    if (!AIPlayersSet.has(clientShips[i].socketId)) { //update only real players
      updateClientWithServer(clientShips[i]);
    }
	}

}

function updateClientWithServer (clientShip) {

  var playerShipsSlim = [];

  var canidates = shipTree.retrieve({
    x: clientShip.xPos - SHIP_CLIENT_UPDATE_RADIUS,
    y: clientShip.yPos - SHIP_CLIENT_UPDATE_RADIUS,
    width: (SHIP_CLIENT_UPDATE_RADIUS*2),
    height: (SHIP_CLIENT_UPDATE_RADIUS*2)
  });

  //use quadtree to skip updating ships too far away from client
  for (var i = 0; i < canidates.length; i++) {

      if (clientShipsMap.has(canidates[i].id)) {

          var playerShip = clientShipsMap.get(canidates[i].id); //check canidate hasnt been removed in event

          if (mag(clientShip.xPos - playerShip.xPos, clientShip.yPos - playerShip.yPos) < SHIP_CLIENT_UPDATE_RADIUS
            && clientShip.socketId != playerShip.socketId) {

              var shipAccelerating = ((playerShip.shipAccelerating) ? 1 : 0);
              var shipInWarp = ((playerShip.shipInWarp) ? 1 : 0);
              var shipShielded = ((playerShip.shipShielded) ? 1 : 0);
              var shipInvisible = ((playerShip.shipInvisible) ? 1 : 0);
              var shipAlive = ((playerShip.shipAlive) ? 1 : 0);

              var playerShipSlim = new Float64Array([

                playerShip.shipId,
                playerShip.xPos.toFixed(NUMERICAL_DECIMAL_TRIM),
                playerShip.yPos.toFixed(NUMERICAL_DECIMAL_TRIM),
                playerShip.xVel.toFixed(NUMERICAL_DECIMAL_TRIM),
                playerShip.yVel.toFixed(NUMERICAL_DECIMAL_TRIM),
                playerShip.rotation,

                playerShip.shipHealthPer.toFixed(NUMERICAL_DECIMAL_TRIM),
                shipAccelerating,
                shipInWarp,
                shipShielded,
                shipInvisible,
                shipAlive
              ]);

              playerShipsSlim.push(playerShipSlim);
          }
      }
  }

  if (playerShipsSlim.length > 0) {
    io.sockets.connected[clientShip.socketId].emit(UPDATE_PLAYER_SHIPS_EV, playerShipsSlim);
  }

  var shipAccelerating = ((clientShip.shipAccelerating) ? 1 : 0);
  var shipInWarp = ((clientShip.shipInWarp) ? 1 : 0);
  var shipShielded = ((clientShip.shipShielded) ? 1 : 0);
  var shipInvisible = ((clientShip.shipInvisible) ? 1 : 0);
  var shipAlive = ((clientShip.shipAlive) ? 1 : 0);

  var clientShipSlim = new Float64Array([

    clientShip.shipId,
    clientShip.xPos.toFixed(NUMERICAL_DECIMAL_TRIM),
    clientShip.yPos.toFixed(NUMERICAL_DECIMAL_TRIM),
    clientShip.xVel.toFixed(NUMERICAL_DECIMAL_TRIM),
    clientShip.yVel.toFixed(NUMERICAL_DECIMAL_TRIM),
    clientShip.rotation,

    clientShip.shipScore,
    clientShip.shipWarpBankSize,
    clientShip.shipWarpsRemaining,
    clientShip.shipHealthPer.toFixed(NUMERICAL_DECIMAL_TRIM),
    shipAccelerating,
    shipInWarp,
    shipShielded,
    shipInvisible,
    shipAlive
  ]);

  io.sockets.connected[clientShip.socketId].emit(UPDATE_CLIENT_SHIP_EV, clientShipSlim);

}

function updateClientsWithLeader() {
  if (leaderboardRankings.length > 0) {
    if (clientShipsMap.has(leaderboardRankings[0])) { //get leading ship
      var leaderShip = clientShipsMap.get(leaderboardRankings[0]);
      var leaderPosSlim = new Float64Array(2);
      leaderPosSlim[0] = leaderShip.xPos.toFixed(NUMERICAL_DECIMAL_TRIM);
      leaderPosSlim[1] = leaderShip.yPos.toFixed(NUMERICAL_DECIMAL_TRIM);

      io.sockets.emit(UPDATE_LEADER_POSITION, leaderPosSlim);
    }
  }
}

function updateLeaderboard() {

  var oldLeaderboardRankings = [];
  var oldLeaderScores = [];

  for (var j = 0; j < leaderboardRankings.length; j++) { //store old values for comparison later
    oldLeaderboardRankings.push(leaderboardRankings[j]);
    oldLeaderScores.push(leaderScores[j]);
  }

  leaderboardRankings = []; //create new array references
  leaderScores = [];

  var playerShips = Array.from(clientShipsMap.values());
  playerShips.sort(function(b, a) {
    return (a.shipScore > b.shipScore) ? 1 : ((b.shipScore > a.shipScore) ? -1 : 0);
  });

  var num = (playerShips.length < LEADERBOARD_CAPACITY) ? playerShips.length : LEADERBOARD_CAPACITY;

  for (var i = 0; i < num; i++) {
    if (playerShips[i].shipAlive) {
      leaderboardRankings.push(playerShips[i].socketId);
      var score = playerShips[i].shipScore;
      if (score > 999) { //format score if necessary
        score = (score*0.001).toFixed(1) + "k";
      }
      leaderScores.push(score);
    }
  }

  //update client leaderboard if ranking OR score changes
  if ((!compare(leaderboardRankings, oldLeaderboardRankings)) || (!compare(leaderScores, oldLeaderScores))) {
    emitLeaderboard();
  }

}

function getShipDims (type) { //TODO remove and implement somthings thats actually good
  switch (type) {
    case 0:
      return ({ x: 27, y: 25});
      break;
    case 1:
      return ({ x: 27, y: 20});
      break;
    case 2:
      return ({ x: 27, y: 27});
      break;
    case 3:
      return ({ x: 27, y: 27});
      break;
    default:
      output("Error in ship dims");
      return ({ x: 0, y: 0});
  }
}

function addPowerup (powerup) {
  var powerupSlim = new Float64Array ([
    powerup.type,
    powerup.xPos,
    powerup.yPos
  ]);

  io.sockets.emit(ADD_POWERUP_EV, powerupSlim);
}

function killPowerup (powerup) {
  var m = powerups.indexOf(powerup);
  io.sockets.emit(KILL_POWERUP_EV, m);
}

function killProjectile(projectile) {

  if (clientShipsMap.has(projectile.id)) { //check to see if obj still exists in map
    var clientShip = clientShipsMap.get(projectile.id);

    var proj = new Float64Array ([
      clientShip.shipId,
      projectile.projID,
    ]);

    io.sockets.emit(KILL_PROJECTILE_EV, proj);

  }

}

function killShip(shipKilled, shipKiller) {

  shipKilled.shipAlive = false;
  shipKilled.shipHealth = 0;
  shipKilled.xVel = 0;
  shipKilled.yVel = 0;
  shipKilled.xAcc = 0;
  shipKilled.yAcc = 0;

  var killSig;

  if (shipKiller == -1) {
    killSig = new Float64Array ([
     shipKilled.shipId,
     -1
    ]);
  } else {
    killSig = new Float64Array ([
     shipKilled.shipId,
     shipKiller.shipId
    ]);

    //reward killer
    shipKiller.shipHealthMax = shipKiller.shipHealthMax + SHIP_KILL_HEALTH_INC; //increase max health
    changeScore(shipKilled, shipKilled.shipScore * SHIP_KILL_SCORE_STEAL_PER + shipKiller.shipScore); //steal score for killed ship
    if ((shipKiller.shipHealth + shipKiller.shipHealthMax*SHIP_KILL_HEAL_PER) > shipKiller.shipHealthMax) { //heal for percentage of ship
      shipKiller.shipHealth = shipKiller.shipHealthMax;
    } else {
      shipKiller.shipHealth = (shipKiller.shipHealth + shipKiller.shipHealthMax*SHIP_KILL_HEAL_PER);
    }
    shipKiller.shipHealthPer = shipKiller.shipHealth/shipKiller.shipHealthMax;
    if (shipKiller.shipShielded) {//give temporary sheild if not shielded
      shipKiller.shipShieldedTime = shipKiller.shipShieldedTime + SHIP_KILL_SHIELD_TIME;
    } else {
      shipKiller.shipShielded = true;
      shipKiller.shipShieldedTime = SHIP_KILL_SHIELD_TIME;
    }

  }

  if (clientShipsMap.has(shipKilled.socketId)) {
    clientShipsMap.delete(shipKilled.socketId);
  }

  io.sockets.emit(KILL_SHIP_EV, killSig);

}

function damageShipContinous(clientShip, damage) {

  if (clientShip.shipShielded) {
    damage = damage * POWERUP_SHIELD_DAMAGE_REDUCTION;
  }

	if ((clientShip.shipHealth - damage*deltaTime) > 0) {
		clientShip.shipHealth = clientShip.shipHealth - damage*deltaTime;
	} else {
		clientShip.shipHealth = 0;
	}

  clientShip.shipHealthPer = (clientShip.shipHealth/clientShip.shipHealthMax);

}

function damageShipDiscreet(clientShip, damage) {

  if (clientShip.shipShielded) {
    damage = damage * POWERUP_SHIELD_DAMAGE_REDUCTION;
  }

	if ((clientShip.shipHealth - damage) > 0) {
		clientShip.shipHealth = clientShip.shipHealth - damage;
	} else {
		clientShip.shipHealth = 0;
	}

  clientShip.shipHealthPer = (clientShip.shipHealth/clientShip.shipHealthMax);

}

function changeScore (clientShip, change) {
  change = parseInt(change);
	if ((clientShip.shipScore + change) < MAX_SCORE)  {
		clientShip.shipScore = clientShip.shipScore + change;
	} else {
    clientShip.shipScore = MAX_SCORE;
  }
}

function getAIPlayerName(){
  return AIPlayerNames[integerInRange(0, AIPlayerNames.length - 1)];
}

function output(message) {
  if (LOG_FILE) {
    message = message + "\n";
    fs.appendFile(logFileName, message, writeError);
  } else {
    console.log(message);
  }
}

function genLogFileName() {
  var d = new Date();
  var name = "game_" + PORT_NUMBER;
  name = name + "_" + d.toLocaleDateString().replace(/\//g, "-");
  name = name + "-" + d.getUTCMinutes();
  name = name + "-" + d.getUTCSeconds();
  name = name + ".log";
  return name;
}

//HELPER FUNCTIONS
function writeError(error) {
  if (error) throw error;
}

function getIP4(clientConnection) {
  var addr = clientConnection.request.connection.remoteAddress;
  return (addr.split(":")[addr.split(":").length - 1]);
}

function date() {
  return new Date().toLocaleString();
}

function idSub(connection) {
  return connection.id.substr(connection.id.length - 5);
}

function AABB(x1, y1, w1, h1, x2, y2, w2, h2) {
  return (x1 < x2 + w2 && x1 + w1 > x2 &&
     y1 < y2 + h2 && h1 + y1 > y2);
}

function verifyShipName(name) {
  name = name.trim();
  if ((name.length <= 0) || (name.length > 16)) {
    name = "l33tH@ck3r 69-420";
  }
  return name;
}

function compare (a, b) {
  if (a.length != b.length) {
    return false;
  } else {
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) {
        return false;
      }
    }
  }
  return true;
}

function integerInRange(min, max) { //inclusive
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function angleBetween(x1, y1, x2, y2) {
  var theta = Math.atan2(y2-y1, x2-x1);
  return (theta < 0) ? (theta + Math.PI * 2) : theta;
}

function mag(a, b) {
  return(Math.pow(a*a + b*b, 0.5));
}

function genID() {
  return (Math.abs(parseInt(Date.now() * Math.random())));
}

setInterval(function(){
  updateLeaderboard();
  updateClientsWithLeader();
}, SERVER_LEADERBOARD_UPDATE_TICK_TIME);

setInterval(function(){
  updateClientsWithServer();
}, SERVER_CLIENT_UPDATE_TICK_TIME);

setInterval(function(){
  updateAIPlayers();
  updateShipStates();
  updateWeapons();
  updatePhysics();
  updateCollisionTrees();
  updateShipCollisions();
	updateProjectileCollisions();
  updatePowerupCollisions();
}, SERVER_PHYSICS_TICK_TIME);

//GAME SERVER - LOAD BALANCER SERVER code
var INIT_LOAD_BALANCER_EV = "yy";
var UPDATE_LOAD_BALANCER_EV = "zz";

function initLoadBalancer() {

  output("CONNECTED TO LOAD BALANCER");

  var gameServer = {
    port: PORT_NUMBER,
    maxPlayers: GAME_MAX_PLAYERS,
    currentPlayers: io.engine.clientsCount
  };

  loadBalancerServerConnection.emit(INIT_LOAD_BALANCER_EV, gameServer);
}

function updateLoadBalancer() {

  var gameServerData = new Float64Array ([
    GAME_MAX_PLAYERS,
    io.engine.clientsCount
  ]);

  loadBalancerServerConnection.emit(UPDATE_LOAD_BALANCER_EV, gameServerData);

}
