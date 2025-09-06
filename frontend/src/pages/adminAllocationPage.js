// src/pages/adminAllocationPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import AdminLayout from "../components/adminLayout";
import "./adminAllocationPage.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

/* ===========================
   Confirm modal + hook (reusable)
   =========================== */
function ConfirmModal({
  open,
  title = "Confirm",
  message,
  confirmText = "OK",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  return (
    <div className="adbd-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="adbd-modal">
        <h4 id="confirm-title" className="adbd-modal-title">{title}</h4>
        {message && <p className="adbd-modal-body">{message}</p>}
        <div className="adbd-modal-actions">
          <button className="adbd-btn adbd-btn--ghost" onClick={onCancel}>{cancelText}</button>
          <button className="adbd-btn adbd-btn--primary" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

function useConfirm() {
  const [state, setState] = React.useState({ open: false });
  const confirm = React.useCallback(({ title, message, confirmText = "OK", cancelText = "Cancel" }) => {
    return new Promise((resolve) => {
      setState({
        open: true,
        title,
        message,
        confirmText,
        cancelText,
        onConfirm: () => { setState({ open: false }); resolve(true); },
        onCancel:  () => { setState({ open: false }); resolve(false); },
      });
    });
  }, []);
  const modal = (
    <ConfirmModal
      open={state.open}
      title={state.title}
      message={state.message}
      confirmText={state.confirmText}
      cancelText={state.cancelText}
      onConfirm={state.onConfirm}
      onCancel={state.onCancel}
    />
  );
  return [confirm, modal];
}

/* ===========================
   Basic content modal (two-step flow & report modal)
   =========================== */
function BasicModal({ open, title, children, actions }) {
  if (!open) return null;
  return (
    <div className="adbd-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="adbd-modal">
        {title && <h4 id="modal-title" className="adbd-modal-title">{title}</h4>}
        <div className="adbd-modal-body">{children}</div>
        <div className="adbd-modal-actions">{actions}</div>
      </div>
    </div>
  );
}

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
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    throw new Error("Your session has expired. Please log in again.");
  }

  let data = {};
  try {
    data = await res.json();
  } catch (_) {
    /* non-JSON response */
  }
  if (!res.ok) throw new Error(data?.message || "Request failed");
  return data;
}

/** Download helper for CSV reports (with auth) */
async function apiDownload(path) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    // try to surface a helpful message instead of dumping HTML
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const j = await res.json();
        throw new Error(j?.message || "Download failed");
      }
      const t = await res.text();
      throw new Error(t?.slice(0, 200) || "Download failed");
    } catch (e) {
      throw new Error(e?.message || "Download failed");
    }
  }
  return await res.blob();
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
  const [confirm, confirmModal] = useConfirm();          // confirm hook
  const [activeModal, setActiveModal] = useState(null);  // null | 'commitCycle' | 'commitAlloc'
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState("allocations"); // 'allocations' | 'supervisor-load'

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [editing, setEditing] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);

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
      if (!creatingNew) {
        setForm(
          data?.cycle
            ? {
                name: data.cycle?.name || "",
                submission_open_at: toLocalInput(data.cycle?.submission_open_at),
                submission_close_at: toLocalInput(data.cycle?.submission_close_at),
                commit_at: toLocalInput(data.cycle?.commit_at),
              }
            : { name: "", submission_open_at: "", submission_close_at: "", commit_at: "" }
        );
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-open the report modal via /admin/allocations?report=1
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("report") === "1") setReportOpen(true);
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

  /** Create a new cycle, then OPEN it */
  const newCycle = async () => {
    setErr("");
    setOk("");

    if (!form.name.trim() || !form.submission_open_at || !form.submission_close_at) {
      setErr("Name, Opens and Closes are required.");
      return;
    }
    if (new Date(form.submission_close_at) <= new Date(form.submission_open_at)) {
      setErr("Close must be after open.");
      return;
    }

    try {
      const payload = {
        name: form.name || `Allocation ${new Date().getFullYear()}`,
        submission_open_at: form.submission_open_at,
        submission_close_at: form.submission_close_at,
        commit_at: form.commit_at || null,
      };

      const created = await apiFetch("/cycle", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await apiFetch(`/cycle/${created.cycle_id}/open?now=1`, { method: "POST" });

      setOk("New cycle created and opened.");
      setCreatingNew(false);
      setEditing(false);
      await loadStatus();
    } catch (e) {
      setErr(e.message);
    }
  };

  const saveCycle = async () => {
    if (!status?.cycle) return;
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
    if (!status?.cycle) return;
    const id = status.cycle.cycle_id;
    setErr("");
    setOk("");

    try {
      await apiFetch(`/cycle/${id}`, { method: "DELETE" });
      setOk("Cycle deleted.");
      setStatus(null);
      setForm({ name: "", submission_open_at: "", submission_close_at: "", commit_at: "" });
      setCreatingNew(false);
      return;
    } catch (e) {
      const msg = (e?.message || "").toLowerCase();
      if (msg.includes("pass ?force=1")) {
        const okForce = await confirm({
          title: "Force delete cycle?",
          message:
            "This cycle still has related data (projects/allocations). Delete the cycle and remove ALL related data?",
          confirmText: "Delete everything",
          cancelText: "Cancel",
        });
        if (!okForce) {
          setErr("Deletion cancelled.");
          return;
        }
        try {
          await apiFetch(`/cycle/${id}?force=1`, { method: "DELETE" });
          setOk("Cycle and related data deleted.");
          setStatus(null);
          setForm({ name: "", submission_open_at: "", submission_close_at: "", commit_at: "" });
          setCreatingNew(false);
          return;
        } catch (e2) {
          setErr(e2.message || "Force delete failed");
          return;
        }
      }
      setErr(e.message || "Delete failed");
    }
  };

  // Status & actions
  const statusStr = String(status?.cycle?.status || "").toLowerCase(); // draft|open|closed|committed
  const isOpen = statusStr === "open";
  const isClosedOrCommitted = statusStr === "closed" || statusStr === "committed";

  const openNow = async () => {
    if (!status?.cycle) return;
    try {
      await apiFetch(`/cycle/${status.cycle.cycle_id}/open?now=1`, { method: "POST" });
      setOk("Cycle opened.");
      await loadStatus();
    } catch (e) {
      setErr(e.message);
    }
  };
  const closeNow = async () => {
    if (!status?.cycle) return;
    try {
      await apiFetch(`/cycle/${status.cycle.cycle_id}/close?now=1`, { method: "POST" });
      setOk("Cycle closed.");
      await loadStatus();
    } catch (e) {
      setErr(e.message);
    }
  };

  // Allocation preview
  const doPreview = async () => {
    setPreview(null);
    setPreviewing(true);
    setErr("");
    try {
      const data = await apiFetch("/allocations/preview", {
        method: "POST",
        body: JSON.stringify(
          status?.cycle?.cycle_id ? { cycle_id: status.cycle.cycle_id } : {}
        ),
      });
      setPreview(data);
      if (!data.allocations?.length) setOk("No eligible preferences found.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setPreviewing(false);
    }
  };

  // Allocation commit
  const doCommit = async () => {
    setCommitting(true);
    setCommitMsg("");
    try {
      const data = await apiFetch("/allocations/commit", {
        method: "POST",
        body: JSON.stringify(
          status?.cycle?.cycle_id ? { cycle_id: status.cycle.cycle_id } : {}
        ),
      });
      setCommitMsg(`Committed: ${data.inserted} new allocations`);
      setPreview(null);
      await loadStatus();
    } catch (e) {
      setErr(e.message);
    } finally {
      setCommitting(false);
    }
  };

  /* ================
     Report generation (CSV download)
     ================ */
  const handleDownloadReport = async () => {
    try {
      const id = status?.cycle?.cycle_id;
      if (!id) throw new Error("No active cycle");
      const path =
        reportType === "allocations"
          ? `/reports/allocations.csv?cycle_id=${id}`
          : `/reports/supervisor-load.csv?cycle_id=${id}`;
      const blob = await apiDownload(path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportType}_cycle_${id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setReportOpen(false);
    } catch (e) {
      setErr(e.message);
    }
  };

  /* ================
     Two-step modal flow
     ================ */

  // Step 1: open commit-cycle modal
  const commitNow = () => {
    if (!status?.cycle) return;
    setActiveModal("commitCycle");
  };

  // Step 1 action: mark cycle as committed
  const handleCommitCycle = async () => {
    if (!status?.cycle) return;
    try {
      await apiFetch(`/cycle/${status.cycle.cycle_id}/commit-now`, { method: "POST" });
      setOk("Cycle marked as committed.");
      await loadStatus();
      setActiveModal(null);
    } catch (e) {
      setErr(e.message);
    }
  };

  // Step 1 action: go to step 2 (alloc commit)
  const goToCommitAllocations = () => {
    setActiveModal(null);
    setActiveModal("commitAlloc");
  };

  // Enable commit when commit time is reached OR after submissions close
  const canCommit = !!status?.cycle && (status?.canCommitNow || status?.hasPassedDeadline);

  return (
    <AdminLayout>
      <div className="adbd-grid">
        {/* Active / Last Cycle */}
        <section className="adbd-card">
          <div className="adbd-head">
            <h3 className="adbd-title">
              {isClosedOrCommitted ? "Last Cycle" : "Active Cycle"}
            </h3>
            <div className="adbd-actions">
              <button className="adbd-btn adbd-btn--ghost" onClick={loadStatus}>
                Refresh
              </button>

              {!creatingNew && (
                <button
                  className="adbd-btn adbd-btn--ghost"
                  onClick={() => {
                    setCreatingNew(true);
                    setEditing(false);
                    setForm({
                      name: "",
                      submission_open_at: "",
                      submission_close_at: "",
                      commit_at: "",
                    });
                  }}
                  title="Create and open a fresh allocation cycle"
                >
                  New cycle
                </button>
              )}

              {status?.cycle && !editing && !creatingNew && (
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
              )}
              {status?.cycle && editing && !creatingNew && (
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
              )}
            </div>
          </div>

          {loading ? (
            <p style={{ color: "#6c6892" }}>Loading…</p>
          ) : creatingNew || !status?.cycle ? (
            <>
              {status?.cycle && (
                <div className="adbd-alert" style={{ marginBottom: 10 }}>
                  You’re looking at the previous cycle ({statusStr || "—"}). Create
                  a new cycle to start a fresh run.
                </div>
              )}
              <div className="adbd-dl">
                <div className="adbd-dl-row">
                  <dt>Name</dt>
                  <dd>
                    <input
                      className="adbd-input"
                      value={form.name}
                      onChange={onChange("name")}
                      placeholder="2025 Dissertation"
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="adbd-btn adbd-btn--primary" onClick={newCycle}>
                  ➕ Create & open cycle
                </button>
                {status?.cycle && (
                  <button
                    className="adbd-btn adbd-btn--ghost"
                    onClick={() => {
                      setCreatingNew(false);
                      loadStatus();
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              {!editing ? (
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
              ) : (
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
              )}

              <div className="adbd-pills">
                <span
                  className={`adbd-pill ${status.isSubmissionOpen ? "adbd-pill--open" : "adbd-pill--closed"}`}
                >
                  {status.isSubmissionOpen ? "Submissions OPEN" : "Submissions CLOSED"}
                </span>
                <span
                  className={`adbd-pill ${status.hasPassedDeadline ? "adbd-pill--warn" : "adbd-pill--open"}`}
                >
                  {status.hasPassedDeadline ? "After deadline" : "Before deadline"}
                </span>
                {isClosedOrCommitted && (
                  <span className="adbd-pill adbd-pill--ghost">Viewing last cycle</span>
                )}
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

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {!isOpen && (
                  <button className="adbd-chip" onClick={openNow}>
                    {isClosedOrCommitted ? "Re-open this cycle" : "Open Now"}
                  </button>
                )}
                {isOpen && (
                  <button className="adbd-chip adbd-chip--warn" onClick={closeNow}>
                    Close Now
                  </button>
                )}
                <button className="adbd-chip" onClick={commitNow}>
                  Commit cycle
                </button>
                <button
                  className="adbd-chip"
                  onClick={() => {
                    setCreatingNew(true);
                    setEditing(false);
                    setForm({
                      name: "",
                      submission_open_at: "",
                      submission_close_at: "",
                      commit_at: "",
                    });
                  }}
                >
                  Start new cycle
                </button>
              </div>
            </>
          )}

          {err && <div className="adbd-alert adbd-alert--error" role="alert">{err}</div>}
          {ok && <div className="adbd-alert adbd-alert--ok" role="status">{ok}</div>}
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

              {/* Generate report */}
              <button
                className="adbd-btn adbd-btn--ghost"
                onClick={() => setReportOpen(true)}
                disabled={!status?.cycle?.cycle_id}
                title={!status?.cycle?.cycle_id ? "No active cycle" : ""}
              >
                Generate report
              </button>

              <button
                className="adbd-btn adbd-btn--primary"
                onClick={async () => {
                  if (!canCommit) return;
                  const okDo = await confirm({
                    title: "Commit allocations?",
                    message: "This will write allocations to the database for the current cycle.",
                    confirmText: "Commit",
                    cancelText: "Cancel",
                  });
                  if (okDo) await doCommit();
                }}
                disabled={committing || !canCommit}
                title={!canCommit ? "Reach commit time or after deadline to enable" : ""}
              >
                {committing ? "Committing…" : "Commit allocations"}
              </button>
            </div>
          </div>

          {commitMsg && <div className="adbd-alert adbd-alert--ok">{commitMsg}</div>}

          {preview && (
            <div className="adbd-preview">
              <div className="adbd-preview-row">
                <strong>Proposed allocations:</strong>{" "}
                {preview?.meta?.proposedAllocations ?? 0}
              </div>
              <div className="adbd-preview-row">
                <strong>Total candidates:</strong>{" "}
                {preview?.meta?.totalCandidates ?? 0}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Step 1: Commit Cycle modal */}
      <BasicModal
        open={activeModal === "commitCycle"}
        title="Commit cycle"
        actions={[
          <button key="cancel" className="adbd-btn adbd-btn--ghost" onClick={() => setActiveModal(null)}>Cancel</button>,
          <button key="alloc"  className="adbd-btn adbd-btn--ghost" onClick={goToCommitAllocations}>Commit allocations…</button>,
          <button key="commit" className="adbd-btn adbd-btn--primary" onClick={handleCommitCycle}>Commit cycle</button>,
        ]}
      >
        <p>
          Mark the current allocation cycle as <strong>committed</strong>. This also
          back-fills the close time if it’s missing.
        </p>
        <p style={{ marginTop: 8 }}>
          To immediately write allocation results to the database, choose
          <em> “Commit allocations…”</em>.
        </p>
      </BasicModal>

      {/* Step 2: Commit Allocations modal */}
      <BasicModal
        open={activeModal === "commitAlloc"}
        title="Commit allocations"
        actions={[
          <button key="cancel" className="adbd-btn adbd-btn--ghost" onClick={() => setActiveModal(null)}>Cancel</button>,
          <button
            key="run"
            className="adbd-btn adbd-btn--primary"
            onClick={async () => {
              setActiveModal(null);
              await doCommit();
            }}
          >
            Run commit
          </button>,
        ]}
      >
        <p>
          This will <strong>write allocations to the database</strong> for the current cycle.
          Proceed?
        </p>
      </BasicModal>

      {/* Report modal */}
      <BasicModal
        open={reportOpen}
        title="Generate report"
        actions={[
          <button key="cancel" className="adbd-btn adbd-btn--ghost" onClick={() => setReportOpen(false)}>Cancel</button>,
          <button key="dl" className="adbd-btn adbd-btn--primary" onClick={handleDownloadReport}>
            Download CSV
          </button>,
        ]}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <label className="adbd-radio" style={{ display: "flex", alignItems: "center" }}>
            <input
              type="radio"
              name="reportType"
              value="allocations"
              checked={reportType === "allocations"}
              onChange={() => setReportType("allocations")}
            />
            <span style={{ marginLeft: 8 }}>
              Allocations — one row per student (student, project, supervisor)
            </span>
          </label>

          <label className="adbd-radio" style={{ display: "flex", alignItems: "center" }}>
            <input
              type="radio"
              name="reportType"
              value="supervisor-load"
              checked={reportType === "supervisor-load"}
              onChange={() => setReportType("supervisor-load")}
            />
            <span style={{ marginLeft: 8 }}>
              Supervisor load — number of allocated students per supervisor
            </span>
          </label>
        </div>
      </BasicModal>

      {/* Single confirm modal (force delete / single-step confirms) */}
      {confirmModal}
    </AdminLayout>
  );
}
