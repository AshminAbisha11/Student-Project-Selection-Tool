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

  // -------- user & initials
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

  // -------- state
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [cycle, setCycle] = useState(null); // { id,name,opensAt,closesAt,commitAt,status,isSubmissionOpen,hasPassedDeadline,canCommitNow }
  const [actionBusy, setActionBusy] = useState(false);
  const alive = useRef(true);

  // -------- load current cycle status
  const loadStatus = useCallback(async () => {
    setLoading(true);
    setErr("");
    const controller = new AbortController();
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`${API}${CYCLE_STATUS_PATH}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
        cache: "no-store",
      });

      if (res.status === 401 || res.status === 403) {
        if (!alive.current) return;
        setErr("Your session has expired. Please log in again.");
        setCycle(null);
        return;
      }

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "Failed to load cycle status");

      const c = payload?.cycle;
      if (!alive.current) return;

      if (!c) {
        setCycle(null);
      } else {
        setCycle({
          id: c.cycle_id,
          name: c.name || "Unnamed cycle",
          opensAt: toDate(c.submission_open_at),
          closesAt: toDate(c.submission_close_at),
          commitAt: toDate(c.commit_at),
          status: String(c.status || "").toLowerCase(), // 'draft'|'open'|'closed'|'committed'
          isSubmissionOpen: !!payload.isSubmissionOpen,
          hasPassedDeadline: !!payload.hasPassedDeadline,
          canCommitNow: !!payload.canCommitNow,
        });
      }
    } catch (e) {
      if (!alive.current) return;
      setErr(e.message || "Failed to load cycle status");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    loadStatus();
    const t = setInterval(loadStatus, 60_000);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [loadStatus]);

  // -------- POST helpers (read token fresh each call)
  async function postAction(path, method = "POST") {
    setActionBusy(true);
    setErr("");
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`${API}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Action failed");
      await loadStatus();
      return data;
    } catch (e) {
      setErr(e.message || "Action failed");
      throw e;
    } finally {
      setActionBusy(false);
    }
  }

  // -------- status pills
  const statusBadge = useMemo(() => {
    if (!cycle) return null;
    const pills = [];
    if (cycle.status === "open") {
      pills.push(
        <span key="sub" className={`ah-pill ${cycle.isSubmissionOpen ? "ok" : ""}`}>
          {cycle.isSubmissionOpen ? "Submissions OPEN" : "Open"}
        </span>
      );
      pills.push(
        <span key="deadline" className={`ah-pill ${cycle.hasPassedDeadline ? "" : "ok"}`}>
          {cycle.hasPassedDeadline ? "Past deadline" : "Before deadline"}
        </span>
      );
    } else {
      pills.push(<span key="state" className="ah-pill">{cycle.status}</span>);
    }
    if (cycle.canCommitNow) {
      pills.push(
        <span key="commit" className="ah-pill ok">
          Ready to commit
        </span>
      );
    }
    return <>{pills}</>;
  }, [cycle]);

  // -------- quick actions (contextual)
  const quickActions = useMemo(() => {
    if (actionBusy) return [{ label: "Working…", onClick: () => {}, disabled: true }];

    if (!cycle) {
      return [
        { label: "Create first cycle", onClick: () => navigate("/admin/allocations") },
        { label: "Manage cycles", onClick: () => navigate("/admin/cycles") },
        { label: "Invite an admin", onClick: () => navigate("/admin/invite-admin") },
      ];
    }

    if (cycle.status === "draft") {
      return [
        { label: "Start cycle now", onClick: () => postAction(`/cycle/${cycle.id}/open?now=1`) },
        { label: "Edit dates", onClick: () => navigate(`/admin/cycles?edit=${cycle.id}`) },
        { label: "Invite students & supervisors", onClick: () => navigate("/admin/invite-admin") },
      ];
    }

    if (cycle.status === "open") {
      if (cycle.hasPassedDeadline) {
        return [
          { label: "Close submissions now", onClick: () => postAction(`/cycle/${cycle.id}/close?now=1`) },
          {
            label: "Go to Allocation run",
            onClick: () => navigate(`/admin/allocations`, { state: { cycleId: cycle.id } }),
          },
          { label: "Manage cycle dates", onClick: () => navigate(`/admin/cycles?edit=${cycle.id}`) },
        ];
      }
      return [
        {
          label: "View submissions",
          onClick: () => navigate(`/admin/allocations`, { state: { cycleId: cycle.id } }),
        },
        { label: "Close submissions now", onClick: () => postAction(`/cycle/${cycle.id}/close?now=1`) },
        { label: "Manage cycle dates", onClick: () => navigate(`/admin/cycles?edit=${cycle.id}`) },
      ];
    }

    if (cycle.status === "closed") {
      return [
        {
          label: "Run allocation",
          onClick: () => navigate(`/admin/allocations`, { state: { cycleId: cycle.id } }),
        },
        {
          label: "Set commit time to now",
          onClick: async () => {
            await postAction(`/cycle/${cycle.id}/commit-now`);
            // optional: jump straight to allocation page
            navigate(`/admin/allocations`, { state: { cycleId: cycle.id } });
          },
        },
        { label: "Re-open cycle", onClick: () => postAction(`/cycle/${cycle.id}/open?now=1`) },
      ];
    }

    // committed
    return [
      {
        label: "View results",
        onClick: () => navigate(`/admin/allocations`, { state: { cycleId: cycle.id } }),
      },
      { label: "Start a new cycle", onClick: () => navigate("/admin/cycles") },
      { label: "Admin help & docs", onClick: () => navigate("/admin/help-support") },
    ];
  }, [cycle, actionBusy, navigate]);

  // -------- render
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
              <button className="as-btn as-btn--ghost" onClick={() => navigate("/change-password")}>
                Change password
              </button>
              <button className="as-btn as-btn--primary" onClick={() => navigate("/settings/profile")}>
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
                <button className="as-btn as-btn--primary" onClick={() => navigate("/admin-login")}>
                  Log in
                </button>
              </div>
            </div>
          ) : !cycle ? (
            <div className="ah-empty">
              <p>No cycle configured yet.</p>
              <div className="ah-actions">
                <button className="as-btn as-btn--primary" onClick={() => navigate("/admin/cycles")}>
                  Create first cycle
                </button>
                <button className="as-btn as-btn--ghost" onClick={() => navigate("/admin/cycles")}>
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
                  <dt>Commit</dt>
                  <dd>{fmt(cycle.commitAt)}</dd>
                </div>
                <div className="row">
                  <dt>Status</dt>
                  <dd>{statusBadge}</dd>
                </div>
              </dl>

              <div className="ah-actions">
                <button
                  className="as-btn as-btn--primary"
                  onClick={() => navigate("/admin/allocations", { state: { cycleId: cycle.id } })}
                >
                  Go to Allocation run
                </button>
                <button
                  className="as-btn as-btn--ghost"
                  onClick={() =>
                    navigate(cycle?.id ? `/admin/cycles?edit=${cycle.id}` : "/admin/cycles")
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
