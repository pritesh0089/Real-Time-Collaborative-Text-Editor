const Document = require("../models/Document");

// Create new document
exports.createDocument = async (req, res) => {
  try {
    const doc = await Document.create(req.body);
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get document by ID
exports.getDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Update document
exports.updateDocument = async (req, res) => {
  console.log('🔄 [Server] Attempting to update document:', req.params.id);
  console.log('🔄 [Server] Incoming data:', req.body);

  try {
    const doc = await Document.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true } // Added runValidators to ensure validation on updates
    );

    if (!doc) {
      console.log('❌ [Server] Document not found for update:', req.params.id);
      return res.status(404).json({ error: "Not found" });
    }

    console.log('✅ [Server] Document updated successfully:', doc);
    res.json(doc);
  } catch (err) {
    console.error('❌ [Server] Error updating document:', err);
    res.status(400).json({ error: err.message });
  }
};

// Delete document
exports.deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" }); // Check if document existed before deleting
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get all documents (for public access - shows recent documents)
exports.getAllDocuments = async (req, res) => {
  try {
    const docs = await Document.find({})
      .select('_id title updatedAt')
      .sort({ updatedAt: -1 })
      .limit(50);
    res.json(docs);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};