import { Routes, Route, Navigate } from 'react-router-dom';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPlaceholder />} />
      <Route path="/register" element={<RegisterPlaceholder />} />
      <Route path="/chat" element={<ChatPlaceholder />} />
      <Route path="/chat/:conversationId" element={<ChatPlaceholder />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

// Placeholder components — will be built out in Phase 2
function LoginPlaceholder() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary-600 mb-2">Exclusive Messenger</h1>
        <p className="text-gray-500">Login page — coming in Phase 2</p>
      </div>
    </div>
  );
}

function RegisterPlaceholder() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary-600 mb-2">Exclusive Messenger</h1>
        <p className="text-gray-500">Register page — coming in Phase 2</p>
      </div>
    </div>
  );
}

function ChatPlaceholder() {
  return (
    <div className="min-h-screen flex bg-surface-50 dark:bg-surface-950">
      <div className="w-80 bg-white dark:bg-surface-900 border-r p-4">
        <h2 className="font-semibold">Conversations</h2>
        <p className="text-sm text-gray-500 mt-2">Sidebar — coming in Phase 2</p>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Select a conversation to start messaging</p>
      </div>
    </div>
  );
}

export default App;
