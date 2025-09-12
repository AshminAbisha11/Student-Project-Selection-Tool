// <-- FIRST, force the mock before any imports
import axios from 'axios/dist/browser/axios.cjs';

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import LoginPage from "../../pages/loginPage";
import { server } from "../__mocks__/server";
import { http, HttpResponse } from "msw";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";
const LOGIN_PATHS = [`${API}/login`, `${API}/auth/login`];

function renderWithRouter(ui, initialEntries = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/student-dashboard" element={<div>Student Dashboard</div>} />
        <Route path="/supervisor-dashboard" element={<div>Supervisor Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  test("renders inputs and Login button", () => {
    renderWithRouter(<LoginPage />);
    expect(screen.getByPlaceholderText(/you@aston\.ac\.uk/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /login/i })).toBeEnabled();
  });

  test("shows validation when empty", async () => {
    const u = userEvent.setup();
    renderWithRouter(<LoginPage />);
    await u.click(screen.getByRole("button", { name: /login/i }));
    expect(screen.getByText(/please fill in all fields/i)).toBeInTheDocument();
  });

  test("successful login stores token and navigates", async () => {
    server.use(
      ...LOGIN_PATHS.map((url) =>
        http.post(url, async ({ request }) => {
          const body = await request.json();
          if (body.email === "ok@aston.ac.uk" && body.password === "secret") {
            return HttpResponse.json({
              token: "jwt-token-123",
              user: { id: 9, role: "student", email: body.email },
              message: "Login successful",
            });
          }
          return new HttpResponse(JSON.stringify({ message: "Invalid credentials" }), { status: 401 });
        })
      )
    );

    const u = userEvent.setup();
    renderWithRouter(<LoginPage />);
    await u.type(screen.getByPlaceholderText(/you@aston\.ac\.uk/i), "ok@aston.ac.uk");
    await u.type(screen.getByPlaceholderText(/password/i), "secret");
    await u.click(screen.getByRole("button", { name: /login/i }));

    expect(await screen.findByText(/student dashboard/i)).toBeInTheDocument();
    expect(localStorage.getItem("token")).toBe("jwt-token-123");
  });

  test("invalid credentials show server error", async () => {
    const u = userEvent.setup();
    renderWithRouter(<LoginPage />);
    await u.type(screen.getByPlaceholderText(/you@aston\.ac\.uk/i), "nope@aston.ac.uk");
    await u.type(screen.getByPlaceholderText(/password/i), "wrong");
    await u.click(screen.getByRole("button", { name: /login/i }));
    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
  });
});
