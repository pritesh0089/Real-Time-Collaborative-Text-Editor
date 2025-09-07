
import React, { useEffect, useState } from 'react';
import { documentService } from '../api/documentService';

export default function DocumentList({ onSelectDocument, onNewDocument }) {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchDocuments() {
      try {
        setIsLoading(true);
        const docs = await documentService.getAllDocuments();
        setDocuments(docs);
      } catch (err) {
        setError('Failed to fetch documents. Please make sure the server is running.');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDocuments();
  }, []);

  if (isLoading) {
    return <div className="text-center p-8">Loading documents...</div>;
  }

  if (error) {
    return <div className="text-center p-8 text-red-500">{error}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">My Documents</h1>
          <button
            onClick={onNewDocument}
            className="px-4 py-2 bg-gray-900 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 transition"
          >
            + New Document
          </button>
        </div>
        
        <div className="bg-white shadow-xl rounded-2xl overflow-hidden">
          {documents.length > 0 ? (
            <ul>
              {documents.map((doc) => (
                <li key={doc._id} className="border-b last:border-b-0">
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      onSelectDocument(doc._id);
                    }}
                    className="block p-6 hover:bg-gray-50 transition"
                  >
                    <h2 className="font-semibold text-lg text-gray-900 truncate">{doc.title || 'Untitled document'}</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Last updated on {new Date(doc.updatedAt).toLocaleDateString()}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-8 text-center text-gray-500">
              You don't have any documents yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
