import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AdminLayout from "../components/adminLayout";
import "./adminHelpSupportPage.css";

export default function AdminHelpSupportPage() {
  const navigate = useNavigate();

  const faqs = [
    {
      q: "How do I open/close an allocation cycle?",
      a: (
        <>
          Go to <Link to="/admin/cycles">Manage Cycles</Link>. Create a cycle with
          open/close dates, then click <strong>Open cycle now</strong>. When
          submissions end, click <strong>Close submissions now</strong>.
        </>
      ),
    },
    {
      q: "How do I run allocations?",
      a: (
        <>
          From <Link to="/admin/allocations">Run Allocations</Link>, pick the current
          cycle and start the allocation. Review results, then save or commit when
          you’re ready.
        </>
      ),
    },
    {
      q: "How do I invite another admin?",
      a: (
        <>
          Use <Link to="/admin/invite-admin">Invite/Create Admin</Link> and ask them
          to complete the admin sign-up. Ensure they log in via the{" "}
          <Link to="/admin-login">Admin Login</Link>.
        </>
      ),
    },
    {
      q: "Students can’t see projects — what should I check?",
      a: (
        <>
          1) Ensure a cycle is <strong>Open</strong> and before the close date. 2)
          Project status is <strong>approved</strong> and not archived. 3) Quotas are
          set and supervisors exist for those projects.
        </>
      ),
    },
    {
      q: "How do I change my password?",
      a: (
        <>
          Open <Link to="/change-password">Change Password</Link>. If you forgot it,
          use <Link to="/forgot-password">Forgot Password</Link>.
        </>
      ),
    },
  ];

  const [open, setOpen] = useState(-1);
  const toggle = (i) => setOpen((v) => (v === i ? -1 : i));

  return (
    <AdminLayout>
      <div className="ahs-layout">
        {/* Header spanning both columns */}
        <section className="as-card ahs-head">
          <h1 className="as-title">Admin Help & Support</h1>
          <div className="ahs-actions">
            <button
              className="as-btn as-btn--primary"
              onClick={() => navigate("/admin/cycles")}
            >
              Manage cycles
            </button>
            <button
              className="as-btn as-btn--ghost"
              onClick={() => navigate("/admin/allocations")}
            >
              Run allocations
            </button>
          </div>
        </section>

        {/* LEFT: Enlarged FAQ block */}
        <section className="as-card ahs-faq ahs-faq--xl">
          <h3 className="as-title" style={{ marginTop: 0 }}>
            Frequently Asked Questions
          </h3>
          <ul className="ahs-accordion">
            {faqs.map((item, i) => {
              const bodyId = `faq-${i}-body`;
              return (
                <li key={i} className={`faq ${open === i ? "open" : ""}`}>
                  <button
                    className="faq-head"
                    onClick={() => toggle(i)}
                    aria-expanded={open === i}
                    aria-controls={bodyId}
                  >
                    <span className="q">{item.q}</span>
                    <span className="chev" aria-hidden>
                      ▸
                    </span>
                  </button>
                  <div id={bodyId} className="faq-body">
                    {item.a}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* RIGHT: sticky sidebar with quick links and resources */}
        <aside className="ahs-right">
          <section className="as-card ahs-card">
            <h3 className="as-title">Quick actions</h3>
            <div className="ahs-quick-list">
              <button className="ahx" onClick={() => navigate("/admin/cycles")}>
                Open/close cycle
              </button>
              <button
                className="ahx"
                onClick={() => navigate("/admin/allocations")}
              >
                Run allocation
              </button>
              <button
                className="ahx"
                onClick={() => navigate("/admin/invite-admin")}
              >
                Invite/create admin
              </button>
              <button className="ahx" onClick={() => navigate("/change-password")}>
                Change password
              </button>
            </div>
          </section>

          <section className="as-card ahs-card">
            <h3 className="as-title">Resources</h3>
            <ul className="ahs-links">
              <li>
                <Link to="/help-support">Student & Supervisor help</Link>
              </li>
              <li>
                <Link to="/supervisor/help-support">Supervisor guide</Link>
              </li>
              <li>
                <Link to="/admin/cycles">Project & Cycle management</Link>
              </li>
            </ul>
          </section>

          <section className="as-card ahs-card">
            <h3 className="as-title">Troubleshooting</h3>
            <ul className="ahs-list">
              <li>Ensure a cycle is open before collecting preferences.</li>
              <li>Approved, non-archived projects appear to students.</li>
              <li>Check date/time and timezone on the server.</li>
            </ul>
          </section>
        </aside>
      </div>
    </AdminLayout>
  );
}
