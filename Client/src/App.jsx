import React, { useState } from 'react';
import DocumentList from './components/DocumentList';
import DocsMVP from './DocsMVP';

export default function App() {
  const [currentView, setCurrentView] = useState('list'); // 'list' or 'editor'
  const [currentDocumentId, setCurrentDocumentId] = useState(null);

  const handleSelectDocument = (documentId) => {
    setCurrentDocumentId(documentId);
    setCurrentView('editor');
  };

  const handleNewDocument = () => {
    setCurrentDocumentId(null);
    setCurrentView('editor');
  };

  const handleBackToList = () => {
    setCurrentView('list');
    setCurrentDocumentId(null);
  };

  if (currentView === 'editor') {
    return (
      <DocsMVP 
        documentId={currentDocumentId} 
        onBackToList={handleBackToList}
      />
    );
  }

  return (
    <DocumentList 
      onSelectDocument={handleSelectDocument}
      onNewDocument={handleNewDocument}
    />
  );
}
