import React from "react";
import AdminSidebar from "./adminSidebar";
import "./adminShell.css";

export default function AdminLayout({ children }) {
  return (
    <div
      className="admin-shell"
      style={{ backgroundImage: "url('/assets/login_background.png')" }}
    >
      <AdminSidebar />
      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}
