// src/pages/adminAllocationPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./adminAllocationPage.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

function apiFetch(path, opts = {}) {
  const token = localStorage.getItem("token");
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      ...(opts.headers || {}),
    },
  });
}
const fmt = (ts) => (ts ? new Date(ts).toLocaleString() : "—");
const toLocalInput = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
};
const fmtHMS = (s) => {
  const pad = (n) => String(n).padStart(2, "0");
  const v = Math.max(0, s | 0);
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const sec = v % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
};

export default function AdminDashboardPage() {
  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    submission_open_at: "",
    submission_close_at: "",
    commit_at: "",
  });

  // Allocation preview/commit
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");

  const loadStatus = async () => {
    setErr("");
    setOk("");
    setLoadingStatus(true);
    try {
      const res = await apiFetch("/cycle/status");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to load status");
      setStatus(data);

      if (data?.hasActiveCycle) {
        setForm({
          name: data.cycle?.name || "",
          submission_open_at: toLocalInput(data.cycle?.submission_open_at),
          submission_close_at: toLocalInput(data.cycle?.submission_close_at),
          commit_at: toLocalInput(data.cycle?.commit_at),
        });
      }
    } catch (e) {
      setErr(e.message || "Failed to load status");
    } finally {
      setLoadingStatus(false);
    }
  };
  useEffect(() => { loadStatus(); }, []);

  // live countdown
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const secsToClose  = useMemo(() => (status?.secondsUntilClose  ?? 0) - tick, [status, tick]);
  const secsToCommit = useMemo(() => (status?.secondsUntilCommit ?? 0) - tick, [status, tick]);

  // edit actions
  const onChange = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const saveCycle = async () => {
    setErr(""); setOk("");
    try {
      const payload = {
        name: form.name,
        submission_open_at: form.submission_open_at ? new Date(form.submission_open_at).toISOString() : null,
        submission_close_at: form.submission_close_at ? new Date(form.submission_close_at).toISOString() : null,
        commit_at: form.commit_at ? new Date(form.commit_at).toISOString() : null,
      };

      if (!status?.hasActiveCycle) {
        // create new (draft)
        const res = await apiFetch("/cycle", { method: "POST", body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "Create failed");
        setOk("Cycle created.");
      } else {
        const res = await apiFetch(`/cycle/${status.cycle.cycle_id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "Update failed");
        setOk("Cycle updated.");
      }
      setEditing(false);
      await loadStatus();
    } catch (e) {
      setErr(e.message || "Save failed");
    }
  };

  const openNow  = async () => { await apiFetch(`/cycle/${status.cycle.cycle_id}/open?now=1`,  { method: 'POST' }); loadStatus(); };
  const closeNow = async () => { await apiFetch(`/cycle/${status.cycle.cycle_id}/close?now=1`, { method: 'POST' }); loadStatus(); };
  const commitNow = async () => { await apiFetch(`/cycle/${status.cycle.cycle_id}/commit-now`, { method: 'POST' }); loadStatus(); };

  // allocation actions
  const doPreview = async () => {
    setPreview(null); setPreviewing(true); setErr("");
    try {
      const res = await apiFetch("/allocations/preview", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Preview failed");
      setPreview(data);
    } catch (e) { setErr(e.message || "Preview failed"); }
    finally { setPreviewing(false); }
  };
  const doCommit = async () => {
    if (!window.confirm("Commit the proposed allocations? This will write to the DB.")) return;
    setCommitting(true); setCommitMsg(""); setErr("");
    try {
      const res = await apiFetch("/allocations/commit", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message || "Commit failed");
      setCommitMsg(`Committed: ${data.inserted} new allocations`);
      setPreview(null);
      await loadStatus();
    } catch (e) { setErr(e.message || "Commit failed"); }
    finally { setCommitting(false); }
  };
  const canCommit = (status?.hasActiveCycle && (status?.canCommitNow || status?.hasPassedDeadline)) || false;

  return (
    <div className="adbd-root" style={{ backgroundImage: "url('/assets/login_background.png')" }}>
      <div className="adbd-grid">
        {/* Active Cycle */}
        <section className="adbd-card">
          <div className="adbd-head">
            <h3 className="adbd-title">Active Cycle</h3>
            {status?.hasActiveCycle && (
              <div className="adbd-actions">
                {!editing ? (
                  <button className="adbd-btn adbd-btn--ghost" onClick={() => setEditing(true)}>Edit</button>
                ) : (
                  <>
                    <button className="adbd-btn adbd-btn--primary" onClick={saveCycle}>Save</button>
                    <button className="adbd-btn adbd-btn--ghost" onClick={() => { setEditing(false); loadStatus(); }}>Cancel</button>
                  </>
                )}
              </div>
            )}
          </div>

          {loadingStatus ? (
            <p style={{ color: "#6c6892", margin: 0 }}>Loading…</p>
          ) : !status?.hasActiveCycle ? (
            <>
              <p style={{ color: "#6c6892", margin: "0 0 8px" }}>No active cycle.</p>
              {/* quick create */}
              <div className="adbd-dl" style={{ marginTop: 8 }}>
                <div className="adbd-dl-row">
                  <dt>Name</dt>
                  <dd><input className="adbd-input" value={form.name} onChange={onChange('name')} placeholder="e.g. 2025 Dissertation" /></dd>
                </div>
                <div className="adbd-dl-row">
                  <dt>Opens</dt>
                  <dd><input type="datetime-local" className="adbd-input" value={form.submission_open_at} onChange={onChange('submission_open_at')} /></dd>
                </div>
                <div className="adbd-dl-row">
                  <dt>Closes</dt>
                  <dd><input type="datetime-local" className="adbd-input" value={form.submission_close_at} onChange={onChange('submission_close_at')} /></dd>
                </div>
                <div className="adbd-dl-row">
                  <dt>Commit time</dt>
                  <dd><input type="datetime-local" className="adbd-input" value={form.commit_at} onChange={onChange('commit_at')} /></dd>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <button className="adbd-btn adbd-btn--primary" onClick={saveCycle}>Create cycle</button>
              </div>
            </>
          ) : (
            <>
              <dl className="adbd-dl">
                <div className="adbd-dl-row">
                  <dt>Name</dt>
                  <dd>
                    {!editing ? status.cycle?.name || "—" :
                      <input className="adbd-input" value={form.name} onChange={onChange('name')} />}
                  </dd>
                </div>

                <div className="adbd-dl-row">
                  <dt>Opens</dt>
                  <dd style={{ display:"flex", alignItems:"center", gap:10 }}>
                    {!editing ? fmt(status.cycle?.submission_open_at) :
                      <input type="datetime-local" className="adbd-input" value={form.submission_open_at} onChange={onChange('submission_open_at')} />}
                    <button className="adbd-chip" onClick={openNow} title="Set status=open and open time to now">Open now</button>
                  </dd>
                </div>

                <div className="adbd-dl-row">
                  <dt>Closes</dt>
                  <dd style={{ display:"flex", alignItems:"center", gap:10 }}>
                    {!editing ? fmt(status.cycle?.submission_close_at) :
                      <input type="datetime-local" className="adbd-input" value={form.submission_close_at} onChange={onChange('submission_close_at')} />}
                    <button className="adbd-chip adbd-chip--warn" onClick={closeNow} title="Set status=closed and close time to now">Close now</button>
                  </dd>
                </div>

                <div className="adbd-dl-row">
                  <dt>Commit time</dt>
                  <dd style={{ display:"flex", alignItems:"center", gap:10 }}>
                    {!editing ? fmt(status.cycle?.commit_at) :
                      <input type="datetime-local" className="adbd-input" value={form.commit_at} onChange={onChange('commit_at')} />}
                    <button className="adbd-chip" onClick={commitNow} title="Set commit time to now">Commit now</button>
                  </dd>
                </div>
              </dl>

              <div className="adbd-pills">
                <span className={"adbd-pill " + (status.isSubmissionOpen ? "adbd-pill--open" : "adbd-pill--closed")}>
                  {status.isSubmissionOpen ? "Submissions OPEN" : "Submissions CLOSED"}
                </span>
                <span className={"adbd-pill " + (status.hasPassedDeadline ? "adbd-pill--warn" : "adbd-pill--open")}>
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
            </>
          )}

          {err && <div className="adbd-alert adbd-alert--error">{err}</div>}
          {ok &&  <div className="adbd-alert adbd-alert--ok">{ok}</div>}
        </section>

        {/* Allocation Run */}
        <section className="adbd-card">
          <div className="adbd-head">
            <h3 className="adbd-title">Allocation Run</h3>
            <div className="adbd-actions">
              <button className="adbd-btn adbd-btn--ghost" onClick={doPreview} disabled={previewing}>
                {previewing ? "Previewing…" : "Preview"}
              </button>
              <button className="adbd-btn adbd-btn--primary" onClick={doCommit} disabled={committing || !canCommit}>
                {committing ? "Committing…" : "Commit allocations"}
              </button>
            </div>
          </div>

          {commitMsg && <div className="adbd-alert adbd-alert--ok">{commitMsg}</div>}
          {preview && (
            <>
              <div style={{ display: "flex", gap: 18, marginTop: 12, color: "#2f2a55" }}>
                <div><b>Candidates:</b> {preview.meta?.totalCandidates ?? "—"}</div>
                <div><b>Proposed:</b> {preview.meta?.proposedAllocations ?? "—"}</div>
              </div>

              <table className="adbd-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>#</th><th>Student</th><th>Project</th><th>Supervisor</th><th>Score</th><th>Pref</th><th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.allocations || []).slice(0, 50).map((a, i) => (
                    <tr key={`${a.student_id}-${a.project_id}`}>
                      <td>{i + 1}</td>
                      <td>{a.student_id}</td>
                      <td>{a.project_id}</td>
                      <td>{a.supervisor_id}</td>
                      <td>{a.score}</td>
                      <td>{a.preference_order}</td>
                      <td>{fmt(a.submitted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(preview.allocations || []).length > 50 && (
                <p style={{ color: "#6c6892", marginTop: 6 }}>
                  Showing first 50 of {preview.allocations.length}…
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
