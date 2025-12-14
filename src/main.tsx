import { createRoot } from "react-dom/client";
import React from "react"; // ⬅️ You need to import React to use StrictMode
import App from "./App.tsx";
import "./index.css";
// ⬅️ Import the AuthProvider you created
import { AuthProvider } from "./hooks/useAuth.tsx"; 

// Use the non-null assertion on document.getElementById("root")! as before
const rootElement = document.getElementById("root")!;

createRoot(rootElement).render(
  // 1. Recommended: Use StrictMode to catch side-effect bugs early
  <React.StrictMode> 
    {/* 2. CRITICAL FIX: Wrap your entire application with the AuthProvider */}
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);