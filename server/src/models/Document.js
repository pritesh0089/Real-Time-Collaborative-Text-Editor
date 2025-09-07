// models/Document.js
const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: mongoose.Schema.Types.Mixed, default: '' }, // Changed type to Mixed
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Create an index on updatedAt
documentSchema.index({ updatedAt: 1 }); // 1 for ascending order

module.exports = mongoose.model("Document", documentSchema);


