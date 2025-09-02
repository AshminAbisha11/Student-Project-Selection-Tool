// src/pages/AdminCyclesPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/adminLayout";
import "./adminCyclesPage.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

function useAuthFetch() {
  const token = useMemo(() => localStorage.getItem("token") || "", []);
  return async (path, opts = {}) => {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Request failed");
    return data;
  };
}

const fmt = (v) => (v ? new Date(v).toLocaleString() : "—");

const emptyForm = {
  name: "",
  submission_open_at: "",
  submission_close_at: "",
  commit_at: "",
};

export default function AdminCyclesPage() {
  const navigate = useNavigate();
  const authFetch = useAuthFetch();

  const [cycles, setCycles] = useState([]);
  const [status, setStatus] = useState(null);

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [openImmediately, setOpenImmediately] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function refresh() {
    setErr("");
    try {
      const [list, stat] = await Promise.all([
        authFetch("/cycle"),
        authFetch("/cycle/status"),
      ]);
      setCycles(list || []);
      setStatus(stat || null);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onEdit = (c) => {
    setErr("");
    setOk("");
    setEditingId(c?.cycle_id ?? null);
    setOpenImmediately(false);
    setForm({
      name: c?.name || "",
      submission_open_at: toLocalInput(c?.submission_open_at),
      submission_close_at: toLocalInput(c?.submission_close_at),
      commit_at: toLocalInput(c?.commit_at),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onCreateNew = () => {
    setErr("");
    setOk("");
    setEditingId(null);
    setOpenImmediately(false);
    setForm(emptyForm);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function toLocalInput(v) {
    if (!v) return "";
    const d = new Date(v);
    const pad = (n) => `${n}`.padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  }

  const setF = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const canSave =
    form.name.trim() &&
    form.submission_open_at &&
    form.submission_close_at &&
    new Date(form.submission_close_at) > new Date(form.submission_open_at);

  async function save(e) {
    e.preventDefault();
    if (!canSave || loading) return;
    setLoading(true);
    setErr("");
    setOk("");
    try {
      if (editingId) {
        await authFetch(`/cycle/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name.trim(),
            submission_open_at: form.submission_open_at,
            submission_close_at: form.submission_close_at,
            commit_at: form.commit_at || null,
          }),
        });
        setOk("Cycle updated.");
      } else {
        const created = await authFetch(`/cycle`, {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            submission_open_at: form.submission_open_at,
            submission_close_at: form.submission_close_at,
            commit_at: form.commit_at || null,
            status: openImmediately ? "open" : "draft",
          }),
        });
        setOk(openImmediately ? "Cycle created & opened." : "Cycle created.");
        // If we asked to open immediately, backend already closed other opens & seeded projects.
        // Still, refresh to reflect the new active cycle.
        if (openImmediately) {
          // nothing else needed
        }
        // Select the new row in UI
        setEditingId(created?.cycle_id || null);
      }
      await refresh();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  async function openNow(id) {
    if (!window.confirm("Open this cycle now? This closes any other open cycle and seeds approved projects from the previous cycle.")) {
      return;
    }
    setLoading(true);
    setErr("");
    setOk("");
    try {
      await authFetch(`/cycle/${id}/open`, { method: "POST" });
      setOk("Cycle opened.");
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function closeNow(id) {
    if (!window.confirm("Close submissions for this cycle now?")) return;
    setLoading(true);
    setErr("");
    setOk("");
    try {
      await authFetch(`/cycle/${id}/close`, { method: "POST" });
      setOk("Cycle closed.");
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function commitNow(id) {
    if (!window.confirm("Mark this cycle as committed now? This finalizes results.")) return;
    setLoading(true);
    setErr("");
    setOk("");
    try {
      await authFetch(`/cycle/${id}/commit-now`, { method: "POST" });
      setOk("Cycle committed.");
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function archive(id) {
    if (!window.confirm("Archive (set to closed) this cycle?")) return;
    setLoading(true);
    setErr("");
    setOk("");
    try {
      await authFetch(`/cycle/${id}/archive`, { method: "PATCH" });
      setOk("Cycle archived.");
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id) {
    const msg =
      "Delete this cycle? This will fail if it has data. Use OK only if you are sure.";
    if (!window.confirm(msg)) return;
    setLoading(true);
    setErr("");
    setOk("");
    try {
      await authFetch(`/cycle/${id}`, { method: "DELETE" });
      setOk("Cycle deleted.");
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function forceRemove(id) {
    const msg =
      "FORCE DELETE: This removes allocations & projects in this cycle. There is no undo. Continue?";
    if (!window.confirm(msg)) return;
    setLoading(true);
    setErr("");
    setOk("");
    try {
      await authFetch(`/cycle/${id}?force=1`, { method: "DELETE" });
      setOk("Cycle force-deleted.");
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const activeId =
    status?.hasActiveCycle && status?.cycle ? status.cycle.cycle_id : null;

  return (
    <AdminLayout>
      <div className="ac-wrap">
        {/* PAGE HEADER */}
        <div className="as-card ac-toolbar">
          <h3 className="as-title">Manage Cycles</h3>
          <div className="ac-toolbar-actions">
            <button className="as-btn as-btn--ghost" onClick={() => navigate("/admin")}>
              ← Back to admin home
            </button>
            <button className="as-btn as-btn--primary" onClick={onCreateNew}>
              + New cycle
            </button>
          </div>
        </div>

        {/* FORM CARD */}
        <section className="as-card ac-form">
          <h4 className="as-title">{editingId ? "Edit cycle" : "Create new cycle"}</h4>

          {err && <div className="as-alert as-alert--error">{err}</div>}
          {ok && <div className="as-alert as-alert--ok">{ok}</div>}

          <form onSubmit={save} className="ac-form-grid" noValidate>
            <label>
              <span>Name</span>
              <input
                type="text"
                value={form.name}
                onChange={setF("name")}
                placeholder="2025 Dissertation"
                required
              />
            </label>

            <label>
              <span>Opens</span>
              <input
                type="datetime-local"
                value={form.submission_open_at}
                onChange={setF("submission_open_at")}
                required
              />
            </label>

            <label>
              <span>Closes</span>
              <input
                type="datetime-local"
                value={form.submission_close_at}
                onChange={setF("submission_close_at")}
                required
              />
            </label>

            <label>
              <span>Commit (optional)</span>
              <input
                type="datetime-local"
                value={form.commit_at}
                onChange={setF("commit_at")}
              />
            </label>

            {!editingId && (
              <label className="ac-open-now">
                <input
                  type="checkbox"
                  checked={openImmediately}
                  onChange={(e) => setOpenImmediately(e.target.checked)}
                />
                <span>Open immediately after create</span>
              </label>
            )}

            <div className="ac-buttons">
              <button
                className="as-btn as-btn--primary"
                type="submit"
                disabled={!canSave || loading}
              >
                {editingId ? "Save changes" : "Create cycle"}
              </button>
              <button
                className="as-btn as-btn--ghost"
                type="button"
                onClick={onCreateNew}
              >
                Reset form
              </button>
            </div>
          </form>
        </section>

        {/* LIST CARD */}
        <section className="as-card ac-list">
          <div className="ac-list-head">
            <h4 className="as-title">All cycles</h4>
            <button className="as-btn as-btn--ghost" onClick={refresh} disabled={loading}>
              Refresh
            </button>
          </div>

          {cycles.length === 0 ? (
            <div className="ac-empty">
              No cycles yet. Create your first cycle with the form above.
            </div>
          ) : (
            <div className="ac-table">
              <div className="ac-trow ac-thead">
                <div>Name</div>
                <div>Opens</div>
                <div>Closes</div>
                <div>Commit</div>
                <div>Status</div>
                <div className="ac-actions-col">Actions</div>
              </div>

              {cycles.map((c) => (
                <div className="ac-trow" key={c.cycle_id}>
                  <div className="ac-name">
                    {c.name}
                    {activeId === c.cycle_id && <span className="ac-badge">Active</span>}
                  </div>
                  <div>{fmt(c.submission_open_at)}</div>
                  <div>{fmt(c.submission_close_at)}</div>
                  <div>{fmt(c.commit_at)}</div>
                  <div>
                    <span className={`ac-status ac-status--${c.status}`}>{c.status}</span>
                  </div>

                  <div className="ac-actions">
                    <button className="as-btn as-btn--ghost" onClick={() => onEdit(c)}>
                      Edit
                    </button>

                    {c.status === "draft" && (
                      <>
                        <button
                          className="as-btn as-btn--primary"
                          onClick={() => openNow(c.cycle_id)}
                        >
                          Open now
                        </button>
                        <button
                          className="as-btn as-btn--ghost"
                          onClick={() => remove(c.cycle_id)}
                        >
                          Delete
                        </button>
                      </>
                    )}

                    {c.status === "open" && (
                      <>
                        <button
                          className="as-btn as-btn--ghost"
                          onClick={() => closeNow(c.cycle_id)}
                        >
                          Close now
                        </button>
                        <button
                          className="as-btn as-btn--ghost"
                          onClick={() => commitNow(c.cycle_id)}
                        >
                          Commit now
                        </button>
                      </>
                    )}

                    {c.status === "closed" && (
                      <>
                        <button
                          className="as-btn as-btn--primary"
                          onClick={() => openNow(c.cycle_id)}
                        >
                          Re-open
                        </button>
                        <button
                          className="as-btn as-btn--ghost"
                          onClick={() => archive(c.cycle_id)}
                        >
                          Archive
                        </button>
                        <button
                          className="as-btn as-btn--ghost"
                          onClick={() => remove(c.cycle_id)}
                        >
                          Delete
                        </button>
                        <button
                          className="as-btn as-btn--ghost danger"
                          onClick={() => forceRemove(c.cycle_id)}
                        >
                          Force delete
                        </button>
                      </>
                    )}

                    {c.status === "committed" && (
                      <>
                        <button
                          className="as-btn as-btn--ghost"
                          onClick={() => openNow(c.cycle_id)}
                        >
                          Start new run from this
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
