import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminSidebar from "./adminSidebar";
import "./adminLayout.css";

export default function AdminLayout({ children }) {
  const navigate = useNavigate();

  // read user (for initials)
  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, []);
  const initials = (user?.name || "Admin")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // profile menu
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    const onDoc = (e) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div
      className="admin-shell"
      style={{
        backgroundImage:
          "url('/assets/bg_waves.svg'), radial-gradient(1200px 800px at 70% -10%, #e7ddff 0%, #eaf0ff 30%, #f7f7ff 70%)",
      }}
    >
      <AdminSidebar />

      <main className="admin-main">
        {/* Header */}
        <header className="as-header">
          <h1 className="as-header__title">Admin Portal</h1>

          <div className="as-header__right" ref={menuRef}>
            <button
              className="as-user"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              title={user?.name || "Admin"}
            >
              <span className="as-avatar">{initials}</span>
              <span className="as-user__chev" aria-hidden>
                ▾
              </span>
            </button>

            {open && (
              <div className="as-menu" role="menu">
                <Link
                  role="menuitem"
                  className="as-menu__item"
                  to="/admin"
                  onClick={() => setOpen(false)}
                >
                  Dashboard
                </Link>
                <button
                  role="menuitem"
                  className="as-menu__item danger"
                  onClick={() => navigate("/logout")}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        {children}
      </main>
    </div>
  );
}
