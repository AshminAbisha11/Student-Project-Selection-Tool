// src/pages/AdminHomePage.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/adminLayout";
import "./adminHomePage.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";
const CYCLE_STATUS_PATH = "/cycle/status";

const toDate = (v) => (v ? new Date(v) : null);
const fmt = (d) =>
  d
    ? d.toLocaleString(undefined, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

export default function AdminHomePage() {
  const navigate = useNavigate();

  /** ---------- user & avatar initials ---------- */
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

  /** ---------- auth headers ---------- */
  const token = localStorage.getItem("token");
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  /** ---------- state ---------- */
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [cycle, setCycle] = useState(null); // { id, name, opensAt, closesAt, status, isSubmissionOpen, hasPassedDeadline }
  const [actionBusy, setActionBusy] = useState(false);

  const alive = useRef(true);

  /** ---------- load current cycle status ---------- */
  const loadStatus = useCallback(async () => {
    setLoading(true);
    setErr("");
    const controller = new AbortController();
    try {
      const res = await fetch(`${API}${CYCLE_STATUS_PATH}`, {
        headers: authHeaders,
        signal: controller.signal,
      });

      if (res.status === 401 || res.status === 403) {
        if (!alive.current) return;
        setErr("Your session has expired. Please log in again.");
        setCycle(null);
        return;
      }

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || "Failed to load cycle status");
      }

      if (!payload.hasActiveCycle) {
        if (!alive.current) return;
        setCycle(null);
      } else {
        const c = payload.cycle || {};
        if (!alive.current) return;
        setCycle({
          id: c.cycle_id,
          name: c.name || "Unnamed cycle",
          opensAt: toDate(c.submission_open_at),
          closesAt: toDate(c.submission_close_at),
          status: c.status, // 'draft' | 'open' | 'closed' | 'committed'
          isSubmissionOpen: !!payload.isSubmissionOpen,
          hasPassedDeadline: !!payload.hasPassedDeadline,
        });
      }
    } catch (e) {
      if (!alive.current) return;
      setErr(e.message || "Failed to load cycle status");
    } finally {
      if (alive.current) setLoading(false);
    }
    return () => controller.abort();
  }, [authHeaders]);

  useEffect(() => {
    alive.current = true;
    loadStatus();

    // Auto-refresh every 60s
    const t = setInterval(loadStatus, 60_000);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [loadStatus]);

  /** ---------- POST actions (open / close / commit) ---------- */
  async function postAction(path) {
    setActionBusy(true);
    setErr("");
    try {
      const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || "Action failed");
      }
      await loadStatus();
    } catch (e) {
      setErr(e.message || "Action failed");
    } finally {
      setActionBusy(false);
    }
  }

  /** ---------- status pills ---------- */
  const statusBadge = useMemo(() => {
    if (!cycle) return null;
    switch (cycle.status) {
      case "open":
        if (cycle.isSubmissionOpen && !cycle.hasPassedDeadline) {
          return (
            <>
              <span className="ah-pill ok">Submissions OPEN</span>
              <span className="ah-pill ok">Before deadline</span>
            </>
          );
        }
        if (cycle.hasPassedDeadline) {
          return <span className="ah-pill">Past deadline</span>;
        }
        return <span className="ah-pill">Open</span>;
      case "draft":
        return <span className="ah-pill">Draft</span>;
      case "closed":
        return <span className="ah-pill">Closed</span>;
      case "committed":
        return <span className="ah-pill">Committed</span>;
      default:
        return null;
    }
  }, [cycle]);

  /** ---------- contextual quick actions ---------- */
  const quickActions = useMemo(() => {
    if (actionBusy) {
      return [{ label: "Working…", onClick: () => {}, disabled: true }];
    }
    if (!cycle) {
      return [
        { label: "Create first cycle", onClick: () => navigate("/admin/cycles") },
        { label: "Invite an admin", onClick: () => navigate("/admin/invite-admin") },
        { label: "Admin help & docs", onClick: () => navigate("/admin/help-support") },
      ];
    }
    if (cycle.status === "draft") {
      return [
        { label: "Open cycle now", onClick: () => postAction(`/cycle/${cycle.id}/open`) },
        { label: "Edit dates", onClick: () => navigate(`/admin/cycles?edit=${cycle.id}`) },
        { label: "Invite students & supervisors", onClick: () => navigate("/admin/invite-admin") },
      ];
    }
    if (cycle.status === "open") {
      if (cycle.hasPassedDeadline) {
        return [
          { label: "Close submissions now", onClick: () => postAction(`/cycle/${cycle.id}/close`) },
          { label: "Run allocation", onClick: () => navigate(`/admin/allocations`, { state: { cycleId: cycle.id } }) },
          { label: "Manage projects", onClick: () => navigate(`/admin/cycles?edit=${cycle.id}`) },
        ];
      }
      // before deadline
      return [
        { label: "View submissions", onClick: () => navigate(`/admin/allocations`, { state: { cycleId: cycle.id } }) },
        { label: "Close submissions now", onClick: () => postAction(`/cycle/${cycle.id}/close`) },
        { label: "Manage projects", onClick: () => navigate(`/admin/cycles?edit=${cycle.id}`) },
      ];
    }
    if (cycle.status === "closed") {
      return [
        { label: "Run allocation", onClick: () => navigate(`/admin/allocations`, { state: { cycleId: cycle.id } }) },
        { label: "Re-open cycle", onClick: () => postAction(`/cycle/${cycle.id}/open`) },
        { label: "Edit dates", onClick: () => navigate(`/admin/cycles?edit=${cycle.id}`) },
      ];
    }
    // committed
    return [
      { label: "View results", onClick: () => navigate(`/admin/allocations`, { state: { cycleId: cycle.id } }) },
      { label: "Start a new cycle", onClick: () => navigate("/admin/cycles") },
      { label: "Admin help & docs", onClick: () => navigate("/admin/help-support") },
    ];
  }, [cycle, actionBusy, navigate]);

  /** ---------- render ---------- */
  return (
    <AdminLayout>
      <div className="ah-grid">
        {/* HERO */}
        <section className="as-card hero">
          <div className="hero-row">
            <div className="ah-avatar">{initials}</div>
            <div className="ah-user">
              <h3 className="as-title">Welcome, {user?.name || "Admin"}</h3>
              {user?.email && <small>{user.email}</small>}
              <small className="ah-role">Role: {user?.role || "admin"}</small>
            </div>
            <div className="hero-spacer" />
            <div className="ah-actions">
              <button
                className="as-btn as-btn--ghost"
                onClick={() => navigate("/change-password")}
              >
                Change password
              </button>
              <button
                className="as-btn as-btn--primary"
                onClick={() => navigate("/settings/profile")}
              >
                Profile settings
              </button>
            </div>
          </div>
        </section>

        {/* CYCLE CARD */}
        <section className="as-card cycle">
          <h3 className="as-title">Current Allocation Cycle</h3>

          {loading ? (
            <div className="ah-skel">
              <div className="sk-row" />
              <div className="sk-row" />
              <div className="sk-row" />
            </div>
          ) : err ? (
            <div className="ah-empty">
              <p>{err}</p>
              <div className="ah-actions">
                <button className="as-btn as-btn--ghost" onClick={loadStatus}>
                  Retry
                </button>
                <button
                  className="as-btn as-btn--primary"
                  onClick={() => navigate("/admin-login")}
                >
                  Log in
                </button>
              </div>
            </div>
          ) : !cycle ? (
            <div className="ah-empty">
              <p>No active cycle.</p>
              <div className="ah-actions">
                <button
                  className="as-btn as-btn--primary"
                  onClick={() => navigate("/admin/cycles")}
                >
                  Create first cycle
                </button>
                <button
                  className="as-btn as-btn--ghost"
                  onClick={() => navigate("/admin/cycles")}
                >
                  Manage cycles
                </button>
              </div>
            </div>
          ) : (
            <>
              <dl className="ah-rows">
                <div className="row">
                  <dt>Name</dt>
                  <dd>{cycle.name}</dd>
                </div>
                <div className="row">
                  <dt>Opens</dt>
                  <dd>{fmt(cycle.opensAt)}</dd>
                </div>
                <div className="row">
                  <dt>Closes</dt>
                  <dd>{fmt(cycle.closesAt)}</dd>
                </div>
                <div className="row">
                  <dt>Status</dt>
                  <dd>{statusBadge}</dd>
                </div>
              </dl>

              <div className="ah-actions">
                <button
                  className="as-btn as-btn--primary"
                  onClick={() =>
                    navigate("/admin/allocations", { state: { cycleId: cycle.id } })
                  }
                >
                  Go to Allocation run
                </button>
                <button
                  className="as-btn as-btn--ghost"
                  onClick={() =>
                    navigate(
                      cycle?.id ? `/admin/cycles?edit=${cycle.id}` : "/admin/cycles"
                    )
                  }
                >
                  Manage cycles
                </button>
              </div>
            </>
          )}
        </section>

        {/* QUICK ACTIONS */}
        <section className="as-card quick">
          <h3 className="as-title">Quick Actions</h3>
          <div className="ah-quick">
            {quickActions.map((a, i) => (
              <button
                key={i}
                className="ah-qa"
                onClick={a.onClick}
                disabled={!!a.disabled}
                aria-disabled={!!a.disabled}
              >
                <span className="icon" />
                {a.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
