require("dotenv").config();
const express = require("express");
const app = express();
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const harperSaveMessage = require("./services/harper-save-message");
const harperGetMessages = require("./services/harper-get-messages");
const leaveRoom = require("./utils/leave-room");

// Enable CORS for the server
app.use(cors());
// Create an HTTP server
const server = http.createServer(app);

// Initialize a socket.io server with CORS settings
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const CHAT_BOT = "ChatBot";
let chatRoom = ""; // Store room names
let allUsers = []; // Store all users in the current chat room

// Set up a connection event for the client using socket.io-client
io.on("connection", (socket) => {
  console.log(`User connected ${socket.id}`);

  // Event to add a user to a room
  socket.on("join_room", (data) => {
    const { username, room } = data;
    socket.join(room);

    let __createdtime__ = Date.now(); // Current timestamp
    // Send a notification to all users in the room (except the new user) about the new user joining
    socket.to(room).emit("receive_message", {
      message: `${username} has joined the chat room`,
      username: CHAT_BOT,
      __createdtime__,
    });
    // Send a welcome message to the new user
    socket.emit("receive_message", {
      message: `Welcome ${username}`,
      username: CHAT_BOT,
      __createdtime__,
    });
    // Add the new user to the room
    chatRoom = room;
    allUsers.push({ id: socket.id, username, room });
    chatRoomUsers = allUsers.filter((user) => user.room === room);
    // Update the user list for all clients in the room
    socket.to(room).emit("chatroom_users", chatRoomUsers);
    socket.emit("chatroom_users", chatRoomUsers);

    // Retrieve the last 100 messages in the chat room
    harperGetMessages(room)
      .then((last100Messages) => {
        // console.log('latest messages', last100Messages);
        socket.emit("last_100_messages", last100Messages);
      })
      .catch((err) => console.log(err));
  });
  // Event for sending a message to a room
  socket.on("send_message", (data) => {
    const { message, username, room, __createdtime__ } = data;
    // Broadcast the message to all users in the room, including the sender
    io.in(room).emit("receive_message", data);
    // Save the message to the database
    harperSaveMessage(message, username, room, __createdtime__)
      .then((response) => console.log(response))
      .catch((err) => console.log(err));
  });
  // Event for a user leaving a room
  socket.on("leave_room", (data) => {
    const { username, room } = data;
    socket.leave(room);
    const __createdtime__ = Date.now();
    // Remove the user from the room
    allUsers = leaveRoom(socket.id, allUsers);
    // Update the user list for all clients in the room
    socket.to(room).emit("chatroom_users", allUsers);
    // Send a message to the room notifying that the user has left
    socket.to(room).emit("receive_message", {
      username: CHAT_BOT,
      message: `${username} has left the chat`,
      __createdtime__,
    });
    console.log(`${username} has left the chat`);
  });

  // Event for a user disconnecting from the server
  socket.on("disconnect", () => {
    console.log("User disconnected from the chat");
    const user = allUsers.find((user) => user.id == socket.id);
    if (user?.username) {
      // Remove the disconnected user from the room
      allUsers = leaveRoom(socket.id, allUsers);
      // Update the user list for all clients in the room
      socket.to(chatRoom).emit("chatroom_users", allUsers);
      // Send a message to the room notifying that the user has disconnected
      socket.to(chatRoom).emit("receive_message", {
        message: `${user.username} has disconnected from the chat.`,
      });
    }
  });
});

server.listen(4000, () => "Server is running on port 4000");
