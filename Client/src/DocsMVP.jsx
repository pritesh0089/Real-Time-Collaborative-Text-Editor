import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createEditor, Transforms, Editor, Element as SlateElement } from "slate";
import { Slate, Editable, withReact, useSlate } from "slate-react";
import { documentService } from "./api/documentService";
import io from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

/* ========= Storage ========= */
const STORAGE_KEY = "docsmvp:document:v1";
const TITLE_KEY = "docsmvp:title:v1";
const DOC_ID_KEY = "docsmvp:documentId:v1";

// Function to clear all local storage data
function clearAllStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TITLE_KEY);
    localStorage.removeItem(DOC_ID_KEY);
    console.log('Local storage cleared');
  } catch (error) {
    console.error('Failed to clear local storage:', error);
  }
}

/* ========= Toolbar ========= */
function ToolbarButton({ onMouseDown, active, label, kbd }) {
  return (
    <button
      type="button"
      onMouseDown={onMouseDown}
      className={`px-3 py-2 rounded-2xl text-sm border transition shadow-sm mr-2 ${
        active ? "bg-gray-200 border-gray-300" : "bg-white hover:bg-gray-50 border-gray-200"
      }`}
      title={kbd ? `${label} (${kbd})` : label}
      aria-pressed={active}
    >
      {label}
      {kbd ? <span className="ml-2 text-xs text-gray-500">{kbd}</span> : null}
    </button>
  );
}

function isMarkActive(editor, mark) {
  const marks = Editor.marks(editor);
  return marks ? !!marks[mark] : false;
}
function toggleMark(editor, mark) {
  const active = isMarkActive(editor, mark);
  if (active) Editor.removeMark(editor, mark);
  else Editor.addMark(editor, mark, true);
}

function MarkButton({ format, label }) {
  const editor = useSlate();
  const active = isMarkActive(editor, format);
  const kbd =
    format === "bold" ? "Ctrl+B" : format === "italic" ? "Ctrl+I" : "Ctrl+U";
  return (
    <ToolbarButton
      onMouseDown={(e) => {
        e.preventDefault();
        toggleMark(editor, format);
      }}
      active={active}
      label={label}
      kbd={kbd}
    />
  );
}

const BLOCK_TYPES = [
  { label: "Normal text", type: "paragraph" },
  { label: "Heading 1", type: "heading", level: 1 },
  { label: "Heading 2", type: "heading", level: 2 },
  { label: "Heading 3", type: "heading", level: 3 },
];

function isBlockActive(editor, type, level) {
  const [match] = Array.from(
    Editor.nodes(editor, {
      at: editor.selection ?? undefined,
      match: (n) =>
        SlateElement.isElement(n) &&
        n.type === type &&
        (type !== "heading" || n.level === level),
    })
  );
  return !!match;
}

function setBlockType(editor, type, level) {
  Transforms.setNodes(editor, type === "heading" ? { type, level } : { type });
}

function BlockDropdown() {
  const editor = useSlate();
  const current = useMemo(() => {
    for (const opt of BLOCK_TYPES) {
      if (isBlockActive(editor, opt.type, opt.level)) return opt;
    }
    return BLOCK_TYPES[0];
  }, [editor]);

  return (
    <select
      className="px-3 py-2 rounded-2xl text-sm border bg-white shadow-sm mr-2"
      value={`${current.type}:${current.level ?? ""}`}
      onChange={(e) => {
        const [type, lvl] = e.target.value.split(":");
        setBlockType(editor, type, lvl ? parseInt(lvl, 10) : undefined);
      }}
    >
      {BLOCK_TYPES.map((opt) => (
        <option
          key={`${opt.type}:${opt.level ?? ""}`}
          value={`${opt.type}:${opt.level ?? ""}`}
        >
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/* ========= Renderers ========= */
function Element({ attributes, children, element }) {
  switch (element.type) {
    case "heading": {
      const lvl = element.level || 1;
      const Tag = `h${lvl}`;
      return (
        <Tag
          {...attributes}
          className={`font-semibold ${
            lvl === 1 ? "text-3xl" : lvl === 2 ? "text-2xl" : "text-xl"
          }`}
        >
          {children}
        </Tag>
      );
    }
    default:
      return (
        <p {...attributes} className="leading-7">
          {children}
        </p>
      );
  }
}
function Leaf({ attributes, children, leaf }) {
  if (leaf.bold) children = <strong>{children}</strong>;
  if (leaf.italic) children = <em>{children}</em>;
  if (leaf.underline) children = <u>{children}</u>;
  return <span {...attributes}>{children}</span>;
}

/* ========= Shortcuts ========= */
function withShortcuts(editor) {
  const origOnKeyDown = editor.onKeyDown;
  editor.onKeyDown = (e) => {
    if (e && (e.ctrlKey || e.metaKey)) {
      const key = String(e.key).toLowerCase();
      if (key === "b") {
        e.preventDefault();
        toggleMark(editor, "bold");
        return;
      }
      if (key === "i") {
        e.preventDefault();
        toggleMark(editor, "italic");
        return;
      }
      if (key === "u") {
        e.preventDefault();
        toggleMark(editor, "underline");
        return;
      }
    }
    if (origOnKeyDown) origOnKeyDown(e);
  };
  return editor;
}

/* ========= Main ========= */
const DEFAULT_VALUE = [
  {
    type: "paragraph",
    children: [{ text: "" }],
  },
];

export default function DocsMVP({ documentId: propDocumentId, onBackToList }) {
  const editor = useMemo(() => withShortcuts(withReact(createEditor())), []);
  const [socket, setSocket] = useState(null);

  const [title, setTitle] = useState("Untitled document");
  const [value, setValue] = useState(() => DEFAULT_VALUE);
  const [savedAt, setSavedAt] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [documentId, setDocumentId] = useState(propDocumentId);
  const [isLoading, setIsLoading] = useState(true);
  const [saveError, setSaveError] = useState(null);

  // Socket.IO connection
  useEffect(() => {
    const s = io(SOCKET_URL);
    setSocket(s);

    s.on("connect", () => {
      console.log("✅ Socket connected:", s.id);
      if (documentId) {
        s.emit("join_document", documentId);
      }
    });

    s.on("receive_changes", ({ changes, senderId }) => {
      // CRITICAL: Ignore changes that originated from the current client.
      if (s.id === senderId) {
        return;
      }

      // Naive update: replace entire document content
      // This can be improved with operational transforms to be more efficient
      // and preserve cursor position.
      if (JSON.stringify(editor.children) !== JSON.stringify(changes)) {
        const { selection } = editor;
        Transforms.deselect(editor);
        editor.children = changes;
        Transforms.select(editor, selection);
      }
    });

    s.on("disconnect", () => {
      console.log("❌ Socket disconnected");
    });

    return () => {
      s.disconnect();
    };
  }, [documentId, editor]);

  // Load document on component mount
  useEffect(() => {
    async function loadDocument() {
      setIsLoading(true);
      
      clearAllStorage();
      
      try {
        if (propDocumentId) {
          console.log('📖 Loading document with ID:', propDocumentId);
          const doc = await documentService.getDocument(propDocumentId);
          console.log('📋 Loaded document:', doc);
          
          setTitle(doc.title);
          
          const validContent = Array.isArray(doc.content) && doc.content.length > 0 
            ? doc.content 
            : DEFAULT_VALUE;
            
          setValue(validContent);
          setDocumentId(doc._id);
          setSavedAt(new Date(doc.updatedAt));
          
          console.log('✅ Document state updated:', {
            title: doc.title,
            content: validContent,
            documentId: doc._id
          });
        } else {
          setTitle("Untitled document");
          setValue(DEFAULT_VALUE);
          setDocumentId(null);
          setSavedAt(null);
        }
      } catch (error) {
        console.error('Failed to load document:', error);
        setTitle("Untitled document");
        setValue(DEFAULT_VALUE);
        setDocumentId(null);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadDocument();
  }, [propDocumentId]);

  // Cloud autosave
  useEffect(() => {
    console.log(`☁️ Autosave effect triggered. isDirty: ${isDirty}, isLoading: ${isLoading}`);

    if (!isDirty || isLoading) {
      console.log('☁️ Autosave condition not met, exiting.');
      return;
    }
    
    console.log('☁️ Setting up autosave timer...');
    const id = setTimeout(async () => {
      console.log('☁️ Timer fired! Attempting to save...');
      try {
        setSaveError(null);
        let savedDoc;
        
        if (documentId) {
          console.log(`☁️ Calling updateDocument for ID: ${documentId}`);
          savedDoc = await documentService.updateDocument(documentId, title, value);
        } else {
          console.log('☁️ Calling createDocument...');
          savedDoc = await documentService.createDocument(title, value);
          setDocumentId(savedDoc._id);
          if (socket) {
            socket.emit("join_document", savedDoc._id);
          }
        }
        
        console.log('☁️ Save successful! Server response:', savedDoc);
        setSavedAt(new Date(savedDoc.updatedAt));
        setIsDirty(false);
      } catch (error) {
        console.error('❌ [CRITICAL] Autosave failed inside catch block:', error);
        setSaveError('Failed to save to cloud');
      }
    }, 600);
    
    return () => {
      console.log('☁️ Cleanup: Clearing autosave timer.');
      clearTimeout(id);
    };
  }, [title, value, isDirty, documentId, isLoading, socket]);


  const renderElement = useCallback((p) => <Element {...p} />, []);
  const renderLeaf = useCallback((p) => <Leaf {...p} />, []);

  const plainText = useMemo(() => {
    try {
      return value
        .map(node => {
          if (node.children) {
            return node.children.map(child => child.text || '').join('');
          }
          return node.text || '';
        })
        .join(' ');
    } catch {
      return "";
    }
  }, [value]);

  const wordCount = useMemo(
    () => {
      const text = plainText.trim();
      return text ? text.split(/\s+/).filter(word => word.length > 0).length : 0;
    },
    [plainText]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Loading document...</div>
      </div>
    );
  }

  const editorValue = Array.isArray(value) && value.length > 0 ? value : DEFAULT_VALUE;

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      {/* App Bar */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBackToList && (
              <button
                onClick={onBackToList}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition"
              >
                ← Back
              </button>
            )}
            <div className="w-8 h-8 rounded-xl bg-gray-900 text-white grid place-items-center font-bold">
              G
            </div>
            <input
              className="text-lg font-medium outline-none bg-transparent px-2 py-1 rounded focus:ring-2 focus:ring-gray-200"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setIsDirty(true);
              }}
            />
          </div>
          <div className="text-xs text-gray-500">
            {isDirty
              ? "Saving to cloud…"
              : saveError
              ? <span className="text-red-500">{saveError}</span>
              : savedAt
              ? `Cloud saved ${savedAt.toLocaleTimeString()}`
              : documentId
              ? "Cloud sync ready"
              : "Ready to save"}
          </div>
        </div>
      </div>

      <Slate
        editor={editor}
        key={documentId || 'new-document'}
        initialValue={editorValue}
        onChange={(v) => {
        console.log('📝 [Client] onChange event fired!');
        // The conditional check was faulty and preventing saves.
        // Removing it ensures that any change marks the document as dirty.
        setValue(v);
        setIsDirty(true);
        if (socket && documentId) {
          socket.emit("send_changes", { documentId, changes: v });
        }
      }}
      >
        {/* Toolbar */}
        <div className="bg-white border-b">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center flex-wrap">
            <BlockDropdown />
            <MarkButton format="bold" label="Bold" />
            <MarkButton format="italic" label="Italic" />
            <MarkButton format="underline" label="Underline" />
            <div className="ml-auto text-sm text-gray-500">{wordCount} words</div>
          </div>
        </div>

        {/* Page */}
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white shadow-xl rounded-2xl p-12 mx-auto min-h-[80vh] w-full relative">
            <Editable
              renderElement={renderElement}
              renderLeaf={renderLeaf}
              placeholder="Start typing… Use the toolbar or Ctrl+B / Ctrl+I / Ctrl+U"
              spellCheck
              autoFocus
              className="outline-none focus:outline-none min-h-[60vh] leading-relaxed text-gray-900"
              style={{
                caretColor: '#374151',
                backgroundColor: 'transparent'
              }}
            />
          </div>
          <div className="text-center text-xs text-gray-400 mt-6">
            Real-time Collaborative Text Editor • Cloud Storage • Slate.js
            {documentId && <div className="mt-1">Document ID: {documentId}</div>}
          </div>
        </div>
      </Slate>
    </div>
  );
}
