// src/pages/adminAllocationPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import AdminLayout from "../components/adminLayout";
import "./adminAllocationPage.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

/** Unified API helper with auth + 401/403 handling */
async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  // Cleanly handle expired / invalid tokens
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    throw new Error("Your session has expired. Please log in again.");
  }

  // Try parse JSON; fall back to empty object
  let data = {};
  try {
    data = await res.json();
  } catch (_) {
    // ignore non-JSON
  }

  if (!res.ok) {
    throw new Error(data?.message || "Request failed");
  }
  return data;
}

const toLocalInput = (sqlDateTime) =>
  sqlDateTime ? String(sqlDateTime).replace(" ", "T").slice(0, 16) : "";
const fmt = (ts) => (ts ? new Date(ts).toLocaleString() : "—");
const fmtHMS = (s) => {
  const pad = (n) => String(n).padStart(2, "0");
  const v = Math.max(0, s | 0);
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const sec = v % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
};

export default function AdminAllocationPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    submission_open_at: "",
    submission_close_at: "",
    commit_at: "",
  });

  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");

  // Load cycle status
  const loadStatus = async () => {
    setErr("");
    setOk("");
    setLoading(true);
    try {
      const data = await apiFetch("/cycle/status");
      setStatus(data);
      setForm(
        data?.hasActiveCycle
          ? {
              name: data.cycle?.name || "",
              submission_open_at: toLocalInput(data.cycle?.submission_open_at),
              submission_close_at: toLocalInput(data.cycle?.submission_close_at),
              commit_at: toLocalInput(data.cycle?.commit_at),
            }
          : {
              name: "",
              submission_open_at: "",
              submission_close_at: "",
              commit_at: "",
            }
      );
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadStatus();
  }, []);

  // Countdown
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const secsToClose = useMemo(
    () => Math.max(0, (status?.secondsUntilClose ?? 0) - tick),
    [status, tick]
  );
  const secsToCommit = useMemo(
    () => Math.max(0, (status?.secondsUntilCommit ?? 0) - tick),
    [status, tick]
  );

  const onChange = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Create new cycle
  const newCycle = async () => {
    setErr("");
    setOk("");
    try {
      const payload = {
        name: form.name,
        submission_open_at: form.submission_open_at || null,
        submission_close_at: form.submission_close_at || null,
        commit_at: form.commit_at || null,
      };
      await apiFetch("/cycle", { method: "POST", body: JSON.stringify(payload) });
      setOk("New cycle created (status = draft). Use 'Open Now' to activate.");
      await loadStatus();
    } catch (e) {
      setErr(e.message);
    }
  };

  const saveCycle = async () => {
    setErr("");
    setOk("");
    try {
      const payload = {
        name: form.name,
        submission_open_at: form.submission_open_at || null,
        submission_close_at: form.submission_close_at || null,
        commit_at: form.commit_at || null,
      };
      await apiFetch(`/cycle/${status.cycle.cycle_id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setOk("Cycle updated.");
      setEditing(false);
      await loadStatus();
    } catch (e) {
      setErr(e.message);
    }
  };

 const deleteCycle = async () => {
  if (!status?.hasActiveCycle) return;

  const id = status.cycle.cycle_id;
  setErr(""); setOk("");

  // 1) try a regular delete
  try {
    await apiFetch(`/cycle/${id}`, { method: "DELETE" });
    setOk("Cycle deleted.");
    setStatus(null);
    setForm({ name: "", submission_open_at: "", submission_close_at: "", commit_at: "" });
    return;
  } catch (e) {
    // 2) if backend says we must force, confirm and retry with ?force=1
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("pass ?force=1")) {
      const yes = window.confirm(
        "This cycle still has data (e.g., projects/allocations). " +
        "Delete the cycle and remove all related data now?"
      );
      if (!yes) {
        setErr("Deletion cancelled.");
        return;
      }
      try {
        await apiFetch(`/cycle/${id}?force=1`, { method: "DELETE" });
        setOk("Cycle and related data deleted.");
        setStatus(null);
        setForm({ name: "", submission_open_at: "", submission_close_at: "", commit_at: "" });
        return;
      } catch (e2) {
        setErr(e2.message || "Force delete failed");
        return;
      }
    }

    // other errors
    setErr(e.message || "Delete failed");
  }
};


  // Status actions
  const openNow = async () => {
    try {
      await apiFetch(`/cycle/${status.cycle.cycle_id}/open?now=1`, {
        method: "POST",
      });
      setOk("Cycle opened.");
      await loadStatus();
    } catch (e) {
      setErr(e.message);
    }
  };
  const closeNow = async () => {
    try {
      await apiFetch(`/cycle/${status.cycle.cycle_id}/close?now=1`, {
        method: "POST",
      });
      setOk("Cycle closed.");
      await loadStatus();
    } catch (e) {
      setErr(e.message);
    }
  };
  const commitNow = async () => {
    try {
      await apiFetch(`/cycle/${status.cycle.cycle_id}/commit-now`, {
        method: "POST",
      });
      setOk("Commit set to now.");
      await loadStatus();
    } catch (e) {
      setErr(e.message);
    }
  };

  // Allocation
  const doPreview = async () => {
    setPreview(null);
    setPreviewing(true);
    setErr("");
    try {
      const data = await apiFetch("/allocations/preview", { method: "POST" });
      setPreview(data);
      if (!data.allocations?.length) setOk("No eligible preferences found.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setPreviewing(false);
    }
  };

  const doCommit = async () => {
    if (!window.confirm("Commit allocations? This will write to DB.")) return;
    setCommitting(true);
    setCommitMsg("");
    try {
      const data = await apiFetch("/allocations/commit", { method: "POST" });
      setCommitMsg(`Committed: ${data.inserted} new allocations`);
      setPreview(null);
      await loadStatus();
    } catch (e) {
      setErr(e.message);
    } finally {
      setCommitting(false);
    }
  };

  const canCommit =
    status?.hasActiveCycle && (status?.canCommitNow || status?.hasPassedDeadline);

  return (
    <AdminLayout>
      <div className="adbd-grid">
        {/* Active Cycle */}
        <section className="adbd-card">
          <div className="adbd-head">
            <h3 className="adbd-title">Active Cycle</h3>
            <div className="adbd-actions">
              <button className="adbd-btn adbd-btn--ghost" onClick={loadStatus}>
                Refresh
              </button>
              {status?.hasActiveCycle &&
                (!editing ? (
                  <>
                    <button
                      className="adbd-btn adbd-btn--ghost"
                      onClick={() => setEditing(true)}
                    >
                      Edit
                    </button>
                    <button
                      className="adbd-btn adbd-btn--danger"
                      onClick={deleteCycle}
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="adbd-btn adbd-btn--primary"
                      onClick={saveCycle}
                    >
                      Save
                    </button>
                    <button
                      className="adbd-btn adbd-btn--ghost"
                      onClick={() => {
                        setEditing(false);
                        loadStatus();
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ))}
            </div>
          </div>

          {loading ? (
            <p style={{ color: "#6c6892" }}>Loading…</p>
          ) : !status?.hasActiveCycle ? (
            <>
              <p style={{ color: "#6c6892" }}>No active cycle.</p>
              <div className="adbd-dl">
                <div className="adbd-dl-row">
                  <dt>Name</dt>
                  <dd>
                    <input
                      className="adbd-input"
                      value={form.name}
                      onChange={onChange("name")}
                    />
                  </dd>
                </div>
                <div className="adbd-dl-row">
                  <dt>Opens</dt>
                  <dd>
                    <input
                      type="datetime-local"
                      className="adbd-input"
                      value={form.submission_open_at}
                      onChange={onChange("submission_open_at")}
                    />
                  </dd>
                </div>
                <div className="adbd-dl-row">
                  <dt>Closes</dt>
                  <dd>
                    <input
                      type="datetime-local"
                      className="adbd-input"
                      value={form.submission_close_at}
                      onChange={onChange("submission_close_at")}
                    />
                  </dd>
                </div>
                <div className="adbd-dl-row">
                  <dt>Commit</dt>
                  <dd>
                    <input
                      type="datetime-local"
                      className="adbd-input"
                      value={form.commit_at}
                      onChange={onChange("commit_at")}
                    />
                  </dd>
                </div>
              </div>
              <button className="adbd-btn adbd-btn--primary" onClick={newCycle}>
                ➕ Create new cycle
              </button>
            </>
          ) : (
            <>
              <dl className="adbd-dl">
                <div className="adbd-dl-row">
                  <dt>Name</dt>
                  <dd>{status.cycle?.name}</dd>
                </div>
                <div className="adbd-dl-row">
                  <dt>Opens</dt>
                  <dd>{fmt(status.cycle?.submission_open_at)}</dd>
                </div>
                <div className="adbd-dl-row">
                  <dt>Closes</dt>
                  <dd>{fmt(status.cycle?.submission_close_at)}</dd>
                </div>
                <div className="adbd-dl-row">
                  <dt>Commit</dt>
                  <dd>{fmt(status.cycle?.commit_at)}</dd>
                </div>
              </dl>

              <div className="adbd-pills">
                <span
                  className={`adbd-pill ${
                    status.isSubmissionOpen ? "adbd-pill--open" : "adbd-pill--closed"
                  }`}
                >
                  {status.isSubmissionOpen
                    ? "Submissions OPEN"
                    : "Submissions CLOSED"}
                </span>
                <span
                  className={`adbd-pill ${
                    status.hasPassedDeadline ? "adbd-pill--warn" : "adbd-pill--open"
                  }`}
                >
                  {status.hasPassedDeadline ? "After deadline" : "Before deadline"}
                </span>
              </div>

              <div className="adbd-timers">
                <div className="adbd-count">
                  <label>Time to close</label>
                  <div className="adbd-time">{fmtHMS(secsToClose)}</div>
                </div>
                <div className="adbd-count">
                  <label>Time to commit</label>
                  <div className="adbd-time">{fmtHMS(secsToCommit)}</div>
                </div>
              </div>

              <div
                style={{
                  marginTop: "12px",
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <button className="adbd-chip" onClick={openNow}>
                  Open Now
                </button>
                <button className="adbd-chip adbd-chip--warn" onClick={closeNow}>
                  Close Now
                </button>
                <button className="adbd-chip" onClick={commitNow}>
                  Commit Now
                </button>
              </div>
            </>
          )}

          {err && <div className="adbd-alert adbd-alert--error">{err}</div>}
          {ok && <div className="adbd-alert adbd-alert--ok">{ok}</div>}
        </section>

        {/* Allocation Run */}
        <section className="adbd-card">
          <div className="adbd-head">
            <h3 className="adbd-title">Allocation Run</h3>
            <div className="adbd-actions">
              <button
                className="adbd-btn adbd-btn--ghost"
                onClick={doPreview}
                disabled={previewing}
              >
                {previewing ? "Previewing…" : "Preview"}
              </button>
              <button
                className="adbd-btn adbd-btn--primary"
                onClick={doCommit}
                disabled={committing || !canCommit}
              >
                {committing ? "Committing…" : "Commit allocations"}
              </button>
            </div>
          </div>
          {commitMsg && <div className="adbd-alert adbd-alert--ok">{commitMsg}</div>}
        </section>
      </div>
    </AdminLayout>
  );
}
