var express = require("express");
var socket = require("socket.io");
var fs = require("fs");

var PORT_NUMBER = 8080;
var PUBLIC_SERVE_DIR = "public";

var LOG_FILE = false;
if (process.argv.length > 2) {
  LOG_FILE = true;
}

var logFileName = genLogFileName();
var app = express();
app.use(express.static(PUBLIC_SERVE_DIR)); //specify directory to serve
var server = app.listen(PORT_NUMBER, onServerStart);

var INIT_LOAD_BALANCER_EV = "yy";
var UPDATE_LOAD_BALANCER_EV = "zz";
var RETURN_GAME_SERVER_EV = "xx";
var REQUEST_GAME_SERVER_EV = "ww";

var gameServersMap = new Map();

function onServerStart() {
  output("LOAD BALANCER INITILIAZED ON PORT " + PORT_NUMBER);
}

var io = socket(server);
io.on("connection", onSocketConnection); //when connected

function onSocketConnection(connection) {

  connection.on(INIT_LOAD_BALANCER_EV, function(gameServer){
    addGameServer(connection, gameServer);
  });

  connection.on(UPDATE_LOAD_BALANCER_EV, function(gameServerData){
    updateGameServer(connection, gameServerData);
  });

  connection.on(REQUEST_GAME_SERVER_EV, function(){
    returnGameServer(connection);
  });

  connection.on("disconnect", function(){
    removeGameServer(connection);
  });

}

function addGameServer(serverConnection, gameServer) {
  if (!gameServersMap.has(serverConnection.id)) {
    //set gameserver ip and add to map
    gameServer.id = serverConnection.id;
    gameServer.ip = getIP4(serverConnection);
    gameServersMap.set(serverConnection.id, gameServer);
    output("ADDED " + gameServer.ip + ":" + gameServer.port + " at " + date());

  } else {
    output("Game server already exists!");
  }
}

function updateGameServer(serverConnection, gameServerData) {
  if (gameServersMap.has(serverConnection.id)) {

    //update existing values
    var gameServer = gameServersMap.get(serverConnection.id);
    gameServer.maxPlayers = gameServerData[0];
    gameServer.currentPlayers = gameServerData[1];

  } else {
    output("Game server does NOT exist!");
  }

}

function removeGameServer(serverConnection) {
  if (gameServersMap.has(serverConnection.id)) {

    var gameServer = gameServersMap.get(serverConnection.id);
    gameServersMap.delete(serverConnection.id);
    output("REMOVED " + gameServer.ip + ":" + gameServer.port + " at " + date());

  } else {
    output("DIS " + getIP4(serverConnection) + "*" + idSub(serverConnection) + " at " + date());
  }
}

function returnGameServer(clientConnection) {
  if (gameServersMap.size > 0) {
    var gameServers = Array.from(gameServersMap.values());
    gameServers.sort(function(a, b) { //sort game servers by population (greatest to least)
      return (b.currentPlayers - a.currentPlayers);
    });

    //set by default to least populated server (will return if all servers are overpopulated)
    var gameServerForClient = gameServers[gameServers.length - 1];

    for(var i = 0; i < gameServers.length; i++) { //set to most populated server under max population
      if (gameServers[i].currentPlayers < gameServers[i].maxPlayers) {
        gameServerForClient = gameServers[i];
        break;
      }
    }

    //return address to client
    var address = gameServerForClient.ip + ":" + gameServerForClient.port;
    clientConnection.emit(RETURN_GAME_SERVER_EV, address);

  } else {
    output("No game servers online!");
  }
}

//HELPER FUNCTIONS
function genLogFileName() {
  var d = new Date();
  var name = "lb_" + PORT_NUMBER;
  name = name + "_" + d.toLocaleDateString().replace(/\//g, "-");
  name = name + "-" + d.getUTCMinutes();
  name = name + "-" + d.getUTCSeconds();
  name = name + ".log";
  return name;
}

function output(message) {
  if (LOG_FILE) {
    message = message + "\n";
    fs.appendFile(logFileName, message, writeError);
  } else {
    console.log(message);
  }
}

function writeError(error) {
  if (error) throw error;
}

function getIP4(connection) {
  var addr = connection.request.connection.remoteAddress;
  return (addr.split(":")[addr.split(":").length - 1]);
}

function date() {
  return new Date().toLocaleString();
}

function idSub(connection) {
  return connection.id.substr(connection.id.length - 5);
}
