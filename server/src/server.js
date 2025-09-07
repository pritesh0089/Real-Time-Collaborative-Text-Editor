// server.js
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const mongoose = require('mongoose');
const cors = require("cors");
const http = require("http"); // Import http module
const { Server } = require("socket.io"); // Import Server from socket.io
const documentRoutes = require('./routes/document'); // We'll create this next
const Document = require("./models/Document"); // Import Document model to update its content

const app = express();
const server = http.createServer(app); // Create an HTTP server from your express app

// Initialize Socket.IO
const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5174", // Allow your frontend to connect
      methods: ["GET", "POST", "PUT", "DELETE"] // Allow all necessary methods
    }
  });

app.use(cors({ 
  origin: process.env.FRONTEND_URL || "http://localhost:5174", // Allow your frontend to connect
  methods: ["GET", "POST", "PUT", "DELETE"] // Allow all necessary methods
}));
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json()); // For parsing application/json

app.use("/api/documents", documentRoutes); // All routes defined in documentRoutes will be prefixed with /api/documents

// Root route for testing
app.get('/', (req, res) => {
  res.json({ 
    message: 'Collaborative Text Editor API is running!',
    endpoints: {
      'POST /api/documents': 'Create a new document',
      'GET /api/documents/:id': 'Get document by ID',
      'PUT /api/documents/:id': 'Update document',
      'DELETE /api/documents/:id': 'Delete document'
    }
  });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ MongoDB Connected to Cluster0...'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});


// Socket.IO Logic
io.on("connection", (socket) => {
    console.log(`User Connected: ${socket.id}`);
  
    // When a user joins a specific document room
    socket.on("join_document", (documentId) => {
      socket.join(documentId);
      console.log(`User ${socket.id} joined document room: ${documentId}`);
  
      // Optionally, send the current document content to the newly joined user
      // This ensures they have the most up-to-date version upon joining.
      // However, the frontend usually fetches the document via REST API first.
      // We'll keep it simple for now and rely on the frontend to fetch.
    });

     // When a user sends a change
  socket.on("send_changes", async ({ documentId, changes }) => {
    // Naive Concurrency: Simply update the document in DB with the latest content
    try {
      const updatedDocument = await Document.findByIdAndUpdate(
        documentId,
        { content: changes.newContent, updatedAt: Date.now() },
        { new: true, runValidators: true }
      );

      if (updatedDocument) {
        // Broadcast the changes to all other clients in the same document room
        // `socket.to(documentId).emit` sends to everyone in the room EXCEPT the sender
        socket.to(documentId).emit("receive_changes", { changes, senderId: socket.id });
        console.log(`Changes broadcasted for document ${documentId} from sender ${socket.id}`);
      }
    } catch (error) {
      console.error(`Error applying changes for document ${documentId}:`, error);
      // Optionally, emit an error back to the sender
      socket.emit("error_applying_changes", { message: "Failed to apply changes", error: error.message });
    }
  });
  
  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`User Disconnected: ${socket.id}`);
  });
});


// // Routes
// app.use('/api/documents', documentRoutes); // All document-related routes will start with /api/documents

// // Simple root route
// app.get('/', (req, res) => {
//   res.send('Document App API is running!');
// });

// Start the server
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));







